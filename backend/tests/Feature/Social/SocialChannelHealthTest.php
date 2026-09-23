<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Notifications\Services\SmsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Social\Jobs\PublishSocialDeliveryJob;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Social Hub audit, 2026-09-24: "token expiry is invisible" and "exhausted
 * retries send no alert". The daily channel check stores what each
 * platform said, the Channels tab shows it, and one SMS goes out per new
 * problem — not one per day for the same problem.
 */
class SocialChannelHealthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Carbon::setTestNow('2026-09-24 10:00:00');
        SiteSetting::set('business_phone', '+9607771234');
        SiteSetting::bust();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function facebook(): SocialChannel
    {
        return SocialChannel::create([
            'platform' => 'facebook',
            'name' => 'Main Page',
            'credentials' => ['page_id' => '111', 'access_token' => 'FB-TOKEN-SECRET'],
            'is_enabled' => true,
            'is_test_channel' => true,
        ]);
    }

    /** @return list<string> the SMS texts sent */
    private function &captureSms(int $expected): array
    {
        $sent = [];
        $sms = $this->createMock(SmsService::class);
        $sms->expects($this->exactly($expected))->method('send')->willReturnCallback(function ($msg) use (&$sent) {
            $sent[] = $msg->message;

            return new SmsLog(['message' => $msg->message, 'to' => $msg->to, 'type' => 'system', 'status' => 'sent']);
        });
        $this->app->instance(SmsService::class, $sms);

        return $sent;
    }

    private int $metaExpiresAt = 0;

    private bool $metaValid = true;

    /** Stacked Http::fake() calls keep the first match, so the fake reads mutable state. */
    private function fakeMeta(int $expiresAt, bool $valid = true): void
    {
        $this->metaExpiresAt = $expiresAt;
        $this->metaValid = $valid;
        Http::fake([
            'graph.facebook.com/*/debug_token*' => fn () => Http::response(['data' => [
                'is_valid' => $this->metaValid,
                'expires_at' => $this->metaExpiresAt,
                'scopes' => ['pages_manage_posts'],
            ]], 200),
            'graph.facebook.com/*/111*' => Http::response(['id' => '111', 'name' => 'Bake & Grill'], 200),
        ]);
    }

    public function test_a_healthy_channel_records_the_expiry_and_page_name_and_sends_nothing(): void
    {
        $this->fakeMeta(now()->addDays(40)->getTimestamp());
        $this->captureSms(0);
        $channel = $this->facebook();

        $this->artisan('social:check-channels')->assertSuccessful();

        $health = $channel->fresh()->health;
        $this->assertSame('ok', $health['status']);
        $this->assertSame('Bake & Grill', $health['account_label']);
        $this->assertSame(40, $channel->fresh()->tokenDaysLeft());

        // The token itself never goes into the stored message.
        $this->assertStringNotContainsString('FB-TOKEN-SECRET', json_encode($health));
    }

    public function test_a_never_expiring_page_token_is_not_1970(): void
    {
        $this->fakeMeta(0);
        $channel = $this->facebook();

        $this->artisan('social:check-channels')->assertSuccessful();

        $this->assertNull($channel->fresh()->health['token_expires_at']);
        $this->assertNull($channel->fresh()->tokenDaysLeft());
        $this->assertStringContainsString('does not expire', $channel->fresh()->health['message']);
    }

    public function test_a_token_inside_its_last_week_warns_once_until_the_expiry_changes(): void
    {
        $this->fakeMeta(now()->addDays(5)->getTimestamp());
        $sent = &$this->captureSms(2);
        $channel = $this->facebook();

        $this->artisan('social:check-channels')->assertSuccessful();
        $this->assertSame('warning', $channel->fresh()->health['status']);
        $this->assertCount(1, $sent);
        $this->assertStringContainsString('expires in 5 days', $sent[0]);

        // Next day, same token: no second SMS.
        Carbon::setTestNow('2026-09-25 10:00:00');
        $this->artisan('social:check-channels')->assertSuccessful();
        $this->assertCount(1, $sent);

        // The owner reconnects: a fresh token far away clears the flag …
        $this->fakeMeta(now()->addDays(60)->getTimestamp());
        $this->artisan('social:check-channels')->assertSuccessful();
        $this->assertSame('ok', $channel->fresh()->health['status']);
        $this->assertNull($channel->fresh()->health['alerted_key']);

        // … so the next expiry warns again.
        Carbon::setTestNow('2026-11-20 10:00:00');
        $this->artisan('social:check-channels')->assertSuccessful();
        $this->assertCount(2, $sent);
    }

    public function test_an_invalid_token_is_an_error_with_one_sms(): void
    {
        $this->fakeMeta(0, valid: false);
        $sent = &$this->captureSms(1);
        $channel = $this->facebook();

        $this->artisan('social:check-channels')->assertSuccessful();
        $this->artisan('social:check-channels')->assertSuccessful();

        $this->assertSame('error', $channel->fresh()->health['status']);
        $this->assertCount(1, $sent);
        $this->assertStringContainsString('check failed', $sent[0]);
        $this->assertStringNotContainsString('FB-TOKEN-SECRET', $sent[0]);
    }

    public function test_telegram_and_viber_report_the_account_and_never_expire(): void
    {
        Http::fake([
            'api.telegram.org/*/getChat*' => Http::response(['ok' => true, 'result' => ['title' => 'BG News']], 200),
            'chatapi.viber.com/pa/get_account_info' => Http::response(['status' => 0, 'name' => 'Bake & Grill MV'], 200),
        ]);
        $telegram = SocialChannel::create([
            'platform' => 'telegram', 'name' => 'TG',
            'credentials' => ['bot_token' => '1:abc', 'chat_id' => '@bg'],
            'is_enabled' => true, 'is_test_channel' => true,
        ]);
        $viber = SocialChannel::create([
            'platform' => 'viber', 'name' => 'VB',
            'credentials' => ['auth_token' => 'vt', 'sender_id' => 's1'],
            'is_enabled' => true, 'is_test_channel' => true,
        ]);

        $this->artisan('social:check-channels')->assertSuccessful();

        $this->assertSame('BG News', $telegram->fresh()->health['account_label']);
        $this->assertSame('ok', $telegram->fresh()->health['status']);
        $this->assertSame('Bake & Grill MV', $viber->fresh()->health['account_label']);
        $this->assertNull($viber->fresh()->health['token_expires_at']);
    }

    public function test_the_channels_tab_sees_the_health_and_can_check_now(): void
    {
        $this->fakeMeta(now()->addDays(3)->getTimestamp());
        $this->captureSms(1);
        $channel = $this->facebook();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->getJson('/api/admin/social/channels')->assertOk()->assertJsonPath('channels.0.health', null);

        $res = $this->postJson("/api/admin/social/channels/{$channel->id}/check")->assertOk();
        $this->assertSame('warning', $res->json('channel.health.status'));
        $this->assertSame(3, $res->json('channel.health.token_days_left'));
        $this->assertSame('Bake & Grill', $res->json('channel.health.account_label'));
        $this->assertStringNotContainsString('FB-TOKEN-SECRET', $res->getContent());

        $this->getJson('/api/admin/social/channels')->assertOk()->assertJsonPath('channels.0.health.status', 'warning');
    }

    public function test_exhausted_retries_mark_the_delivery_failed_and_send_one_sms(): void
    {
        $sent = &$this->captureSms(1);
        $channel = $this->facebook();
        $post = SocialPost::create(['status' => SocialPost::STATUS_QUEUED, 'snapshot' => ['caption' => 'x'], 'source' => 'manual']);
        $delivery = SocialPostDelivery::create([
            'social_post_id' => $post->id,
            'social_channel_id' => $channel->id,
            'status' => SocialPostDelivery::STATUS_QUEUED,
            'error_class' => SocialPostDelivery::ERROR_TRANSIENT,
            'error_message' => 'HTTP 503',
        ]);

        (new PublishSocialDeliveryJob($delivery->id))->failed();

        $this->assertSame(SocialPostDelivery::STATUS_FAILED, $delivery->fresh()->status);
        $this->assertStringContainsString('Gave up', $delivery->fresh()->error_message);
        $this->assertSame(SocialPost::STATUS_FAILED, $post->fresh()->status);
        $this->assertCount(1, $sent);
        $this->assertStringContainsString('retries exhausted', $sent[0]);
    }
}
