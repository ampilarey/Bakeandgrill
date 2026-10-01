<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Console\Commands\RunSocialAutomations;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Social\Drivers\ChannelHealth;
use App\Domains\Social\Drivers\SocialPublishException;
use App\Domains\Social\Jobs\PublishSocialDeliveryJob;
use App\Domains\Social\Services\SocialPublisher;
use App\Domains\Social\Support\SafeErrorText;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\SocialChannel;
use App\Models\SocialLinkVisit;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use App\Models\SocialVideoRendition;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Social Hub audit, 2026-10-01: the seven findings and their fixes.
 * Platform HTTP is always faked; no real calls.
 */
class SocialAuditFixesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        config(['social.ig_poll_delay' => 0, 'social.ig_video_poll_delay' => 0, 'social.publish_allowed' => true]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function instagram(): SocialChannel
    {
        return SocialChannel::create([
            'platform' => 'instagram',
            'name' => 'IG',
            'credentials' => ['ig_user_id' => '999888', 'access_token' => 'IG-SECRET-TOKEN-4242'],
            'is_enabled' => true,
            'is_test_channel' => true,
        ]);
    }

    private function delivery(SocialChannel $channel, array $snapshot, array $attrs = []): SocialPostDelivery
    {
        $post = SocialPost::create([
            'status' => SocialPost::STATUS_QUEUED,
            'snapshot' => $snapshot,
            'source' => 'manual',
        ]);

        return SocialPostDelivery::create(array_merge([
            'social_post_id' => $post->id,
            'social_channel_id' => $channel->id,
            'status' => SocialPostDelivery::STATUS_QUEUED,
        ], $attrs));
    }

    // ── 1. Secrets never reach an error the hub shows ──────────────────────

    public function test_tokens_and_query_strings_are_stripped_from_every_error_text(): void
    {
        $raw = 'cURL error 28: timed out for https://graph.facebook.com/v21.0/me?access_token=EAAB1234567890abcdefghijklmnop&fields=id';

        $clean = SafeErrorText::strip($raw);
        $this->assertStringNotContainsString('EAAB1234567890abcdefghijklmnop', $clean);
        $this->assertStringContainsString('https://graph.facebook.com/v21.0/me?[redacted]', $clean);

        $this->assertStringNotContainsString('EAAB1234567890abcdefghijklmnop', (string) SafeErrorText::strip('token EAAB1234567890abcdefghijklmnop expired'));
        $this->assertSame('client_secret=[redacted]', SafeErrorText::strip('client_secret=abc123'));
        $this->assertSame('https://api.telegram.org/bot[redacted]/sendPhoto', SafeErrorText::strip('https://api.telegram.org/bot123456:ABC-def_ghi/sendPhoto'));
        $this->assertSame('Dry run: http://localhost:8000/menu/2?s=1', SafeErrorText::strip('Dry run: http://localhost:8000/menu/2?s=1'), 'our own tracked links keep their tag');

        $delivery = $this->delivery($this->instagram(), ['caption' => 'x', 'image_url' => 'https://bakeandgrill.mv/i.jpg']);
        $delivery->recordAttempt('failed', $raw);
        $delivery->forceFill(['error_message' => $raw])->save();
        $delivery->refresh();
        $this->assertStringNotContainsString('EAAB1234567890abcdefghijklmnop', (string) $delivery->error_message);
        $this->assertStringNotContainsString('EAAB1234567890abcdefghijklmnop', json_encode($delivery->attempts));

        $this->assertStringNotContainsString('EAAB1234567890abcdefghijklmnop', ChannelHealth::error($raw)->message);
        $this->assertStringNotContainsString('EAAB1234567890abcdefghijklmnop', SocialPublishException::transient($raw)->getMessage());
    }

    // ── 2. The prune knows about social files ──────────────────────────────

    public function test_prune_keeps_a_scheduled_posts_card_and_a_renditions_video(): void
    {
        Storage::fake('public');
        $old = function (string $path): void {
            Storage::disk('public')->put($path, 'x');
            touch(Storage::disk('public')->path($path), now()->subDays(60)->getTimestamp());
        };
        $old('social-cards/weekly-used.jpg');
        $old('social-cards/weekly-orphan.jpg');
        $old('social-videos/5/vertical.mp4');
        $old('social-videos/5/vertical.jpg');
        $old('social-videos/9/orphan.mp4');

        SocialPost::create([
            'status' => SocialPost::STATUS_SCHEDULED,
            'snapshot' => ['caption' => 'This week', 'image_url' => 'https://bakeandgrill.mv/storage/social-cards/weekly-used.jpg'],
            'source' => 'auto_weekly',
            'scheduled_at' => now()->addDay(),
        ]);
        SocialVideoRendition::create([
            'item_id' => \App\Models\Item::factory()->create()->id,
            'format' => 'vertical',
            'status' => 'ready',
            'source_fingerprint' => 'f',
            'width' => 720,
            'height' => 1280,
            'bytes' => 1,
            'mime' => 'video/mp4',
            'path' => 'social-videos/5/vertical.mp4',
            'poster_path' => 'social-videos/5/vertical.jpg',
        ]);

        Artisan::call('media:prune-unreferenced', ['--days' => 7]);

        Storage::disk('public')->assertExists('social-cards/weekly-used.jpg');
        Storage::disk('public')->assertExists('social-videos/5/vertical.mp4');
        Storage::disk('public')->assertExists('social-videos/5/vertical.jpg');
        Storage::disk('public')->assertMissing('social-cards/weekly-orphan.jpg');
        Storage::disk('public')->assertMissing('social-videos/9/orphan.mp4');
    }

    // ── 3. Automations are due for a window, not one minute ────────────────

    public function test_an_automation_is_due_for_three_hours_after_its_time(): void
    {
        $tz = config('app.timezone', 'Indian/Maldives');

        $this->assertFalse(RunSocialAutomations::due(Carbon::parse('2026-10-01 11:59:59', $tz), '12:00'));
        $this->assertTrue(RunSocialAutomations::due(Carbon::parse('2026-10-01 12:00:00', $tz), '12:00'));
        $this->assertTrue(RunSocialAutomations::due(Carbon::parse('2026-10-01 13:37:00', $tz), '12:00'));
        $this->assertTrue(RunSocialAutomations::due(Carbon::parse('2026-10-01 14:59:59', $tz), '12:00'));
        $this->assertFalse(RunSocialAutomations::due(Carbon::parse('2026-10-01 15:00:00', $tz), '12:00'));
        $this->assertFalse(RunSocialAutomations::due(Carbon::parse('2026-10-01 12:30:00', $tz), 'noon'));
        $this->assertSame(180, RunSocialAutomations::GRACE_MINUTES);
    }

    // ── 4. A worker killed mid-publish leaves "unknown", not "processing" ──

    public function test_a_job_that_dies_mid_publish_marks_the_delivery_unknown_and_alerts(): void
    {
        SiteSetting::set('business_phone', '+9607771234');
        SiteSetting::bust();
        $sms = $this->createMock(SmsService::class);
        $sms->expects($this->once())->method('send')->willReturnCallback(function ($msg) {
            $this->assertStringContainsString('stopped mid-publish', $msg->message);

            return new SmsLog(['message' => $msg->message, 'to' => $msg->to, 'type' => 'system', 'status' => 'sent']);
        });
        $this->app->instance(SmsService::class, $sms);

        $delivery = $this->delivery($this->instagram(), ['caption' => 'x', 'image_url' => 'https://bakeandgrill.mv/i.jpg'], [
            'status' => SocialPostDelivery::STATUS_PROCESSING,
            'provider_container_id' => 'CONTAINER-1',
        ]);

        $job = new PublishSocialDeliveryJob($delivery->id);
        $this->assertSame(600, $job->timeout, 'long enough for a carousel or a Reel');
        $job->failed();

        $delivery->refresh();
        $this->assertSame(SocialPostDelivery::STATUS_UNKNOWN, $delivery->status);
        $this->assertSame(SocialPostDelivery::ERROR_UNKNOWN, $delivery->error_class);
        $this->assertStringContainsString('Retry to check', (string) $delivery->error_message);

        // The retry asks Instagram first and never creates a second container.
        Http::fake([
            '*/CONTAINER-1*' => Http::response(['status_code' => 'PUBLISHED'], 200),
            '*/999888/media*' => Http::response(['data' => []], 200),
        ]);
        app(SocialPublisher::class)->deliver($delivery);
        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, $delivery->fresh()->status);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/media_publish'));
    }

    public function test_a_delivery_still_marked_processing_is_reconciled_before_any_new_attempt(): void
    {
        $delivery = $this->delivery($this->instagram(), ['caption' => 'x', 'image_url' => 'https://bakeandgrill.mv/i.jpg'], [
            'status' => SocialPostDelivery::STATUS_PROCESSING,
            'provider_container_id' => 'CONTAINER-2',
        ]);
        Http::fake([
            '*/CONTAINER-2*' => Http::response(['status_code' => 'PUBLISHED'], 200),
            '*/999888/media*' => Http::response(['data' => []], 200),
        ]);

        app(SocialPublisher::class)->deliver($delivery);

        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, $delivery->fresh()->status);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/media_publish'));
    }

    // ── 5. A Reel gets its own, longer polling budget ──────────────────────

    public function test_a_reel_is_polled_with_the_video_budget_not_the_photo_one(): void
    {
        config(['social.ig_poll_attempts' => 1, 'social.ig_video_poll_attempts' => 4]);
        $delivery = $this->delivery($this->instagram(), [
            'caption' => 'Watch',
            'image_url' => 'https://bakeandgrill.mv/storage/social-videos/m.jpg',
            'video_url' => 'https://bakeandgrill.mv/storage/social-videos/m.mp4',
        ]);
        Http::fake([
            '*/999888/media' => Http::response(['id' => 'REEL-1'], 200),
            '*/REEL-1*' => Http::response(['status_code' => 'IN_PROGRESS'], 200),
        ]);

        try {
            app(SocialPublisher::class)->deliver($delivery);
            $this->fail('expected a transient failure after polling');
        } catch (SocialPublishException $e) {
            $this->assertTrue($e->isRetryable());
        }

        $polls = 0;
        Http::assertSent(function ($r) use (&$polls) {
            if ($r->method() === 'GET' && str_contains($r->url(), '/REEL-1')) {
                $polls++;
            }

            return true;
        });
        $this->assertSame(4, $polls, 'four video polls, not the single photo poll');
        $this->assertSame(SocialPostDelivery::STATUS_QUEUED, $delivery->fresh()->status, 'transient: the queue retries');
        $this->assertSame(SocialPostDelivery::ERROR_TRANSIENT, $delivery->fresh()->error_class);
        $this->assertSame('REEL-1', $delivery->fresh()->provider_container_id, 'the container survives for reconcile');
    }

    // ── 6. Reconcile records the media, not the container ──────────────────

    public function test_reconcile_finds_the_published_media_by_caption(): void
    {
        $delivery = $this->delivery($this->instagram(), ['caption' => 'Fresh croissants', 'image_url' => 'https://bakeandgrill.mv/i.jpg'], [
            'status' => SocialPostDelivery::STATUS_UNKNOWN,
            'provider_container_id' => 'CONTAINER-3',
        ]);
        Http::fake([
            '*/CONTAINER-3*' => Http::response(['status_code' => 'PUBLISHED'], 200),
            '*/999888/media*' => Http::response(['data' => [
                ['id' => '17900001', 'caption' => 'Something else', 'permalink' => 'https://www.instagram.com/p/other/'],
                ['id' => '17900002', 'caption' => 'Fresh croissants', 'permalink' => 'https://www.instagram.com/p/abc/'],
            ]], 200),
        ]);

        app(SocialPublisher::class)->deliver($delivery);

        $delivery->refresh();
        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, $delivery->status);
        $this->assertSame('17900002', $delivery->provider_post_id);
        $this->assertSame('https://www.instagram.com/p/abc/', $delivery->permalink);
    }

    public function test_reconcile_falls_back_to_the_container_when_no_media_matches(): void
    {
        $delivery = $this->delivery($this->instagram(), ['caption' => 'Fresh croissants', 'image_url' => 'https://bakeandgrill.mv/i.jpg'], [
            'status' => SocialPostDelivery::STATUS_UNKNOWN,
            'provider_container_id' => 'CONTAINER-4',
        ]);
        Http::fake([
            '*/CONTAINER-4*' => Http::response(['status_code' => 'PUBLISHED'], 200),
            '*/999888/media*' => Http::response(['error' => ['message' => 'nope']], 500),
        ]);

        app(SocialPublisher::class)->deliver($delivery);

        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, $delivery->fresh()->status);
        $this->assertSame('CONTAINER-4', $delivery->fresh()->provider_post_id);
    }

    // ── 7. Tracked-link visits are not kept for ever ───────────────────────

    public function test_old_link_visits_are_pruned_and_the_floor_is_thirty_days(): void
    {
        $delivery = $this->delivery($this->instagram(), ['caption' => 'x', 'image_url' => 'https://bakeandgrill.mv/i.jpg']);
        foreach ([200, 100, 20] as $daysAgo) {
            SocialLinkVisit::create([
                'social_post_delivery_id' => $delivery->id,
                'path' => '/menu/1',
                'visitor_hash' => 'v' . $daysAgo,
                'created_at' => now()->subDays($daysAgo),
            ]);
        }

        Artisan::call('social:prune-visits');
        $this->assertSame([100, 20], SocialLinkVisit::query()->orderBy('created_at')->get()->map(fn ($v) => (int) round($v->created_at->diffInDays(now())))->all());

        Artisan::call('social:prune-visits', ['--days' => 1]);
        $this->assertSame(1, SocialLinkVisit::query()->count(), 'the floor is 30 days; a one-day request keeps the 20-day visit');
    }
}
