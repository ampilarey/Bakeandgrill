<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Notifications\Services\SmsService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Social\Services\NewItemAutoPoster;
use App\Domains\Social\Services\SocialPostApproval;
use App\Models\Item;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\SocialChannel;
use App\Models\SocialComment;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner's shortlist, 2026-09-24, the last three: approving a drafted post
 * from a signed SMS link with no admin login, a Monday digest text of the
 * social week, and a dry-run channel that says what it would have posted
 * and sends nothing.
 */
class SocialApprovalDigestDryRunTest extends TestCase
{
    use RefreshDatabase;

    private SocialChannel $facebook;

    /** @var list<string> */
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        config(['social.publish_allowed' => true]);
        Carbon::setTestNow('2026-09-24 12:00:00');
        $this->facebook = SocialChannel::create([
            'platform' => 'facebook', 'name' => 'Page',
            'credentials' => ['page_id' => '111', 'access_token' => 't'], 'is_enabled' => true, 'is_test_channel' => true,
        ]);
        $sms = $this->createMock(SmsService::class);
        $sms->method('send')->willReturnCallback(function ($msg) {
            $this->sent[] = $msg->to . '|' . $msg->message;

            return new SmsLog(['message' => $msg->message, 'to' => $msg->to, 'type' => 'system', 'status' => 'sent']);
        });
        $this->app->instance(SmsService::class, $sms);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function draftForApproval(): SocialPost
    {
        SiteSetting::set('social_auto_new_item_enabled', '1');
        SiteSetting::set('social_auto_new_item_channel_ids', json_encode([$this->facebook->id]));
        SiteSetting::bust();
        Item::factory()->create(['name' => 'Masroshi', 'image_url' => 'https://cdn.example.com/m.jpg', 'created_at' => now()->subDay()]);

        $post = app(NewItemAutoPoster::class)->run();
        $this->assertNotNull($post);
        $this->assertSame(SocialPost::STATUS_AWAITING_APPROVAL, $post->status);

        return $post;
    }

    // ── Approval on the phone ────────────────────────────────────────────────

    public function test_an_approval_draft_texts_the_business_phone_one_signed_link(): void
    {
        SiteSetting::set('business_phone', '+9607771234');
        $post = $this->draftForApproval();

        $this->assertCount(1, $this->sent);
        $this->assertStringStartsWith('+9607771234|Social: a post about a new dish is waiting for approval: "', $this->sent[0]);
        $this->assertStringContainsString('Approve or reject: ' . url('/social/approve/' . $post->id) . '?expires=', $this->sent[0]);
        $this->assertStringContainsString('&signature=', $this->sent[0]);
    }

    public function test_no_text_when_the_setting_is_off_or_there_is_no_phone(): void
    {
        SiteSetting::set('business_phone', '');
        SiteSetting::bust();
        $this->draftForApproval();
        $this->assertCount(0, $this->sent, 'no business phone, nothing to text');

        SiteSetting::set('business_phone', '+9607771234');
        SiteSetting::set('social_approval_sms', '0');
        SiteSetting::bust();
        Item::factory()->create(['name' => 'Bajiya', 'image_url' => 'https://cdn.example.com/b.jpg', 'created_at' => now()->subDay()]);
        Carbon::setTestNow('2026-09-25 12:00:00');
        $this->assertNotNull(app(NewItemAutoPoster::class)->run());
        $this->assertCount(0, $this->sent);
    }

    public function test_the_signed_page_shows_the_post_and_approve_queues_it(): void
    {
        $post = $this->draftForApproval();
        $link = app(SocialPostApproval::class)->link($post);

        $page = $this->get($link)->assertOk();
        $page->assertSee('Masroshi');
        $page->assertSee('To: Page');
        $page->assertSee('data-testid="approve"', false);

        $approveUrl = (string) preg_replace('/^.*action="([^"]*approve\/' . $post->id . '\/approve[^"]*)".*$/s', '$1', $page->getContent());
        $approveUrl = html_entity_decode($approveUrl);
        $this->assertStringContainsString('/social/approve/' . $post->id . '/approve?expires=', $approveUrl);

        Http::fake(['graph.facebook.com/*' => Http::response(['post_id' => 'p1'], 200)]);
        $done = $this->followingRedirects()->post($approveUrl)->assertOk();
        $done->assertSee('Approved');
        $done->assertSee('data-testid="approval-closed"', false);
        $done->assertDontSee('data-testid="approve"', false);

        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, SocialPostDelivery::firstOrFail()->status, 'approving queues and, with a sync queue, posts');
        $this->assertSame(SocialPost::STATUS_PUBLISHED, $post->fresh()->status);

        // Pressing it again changes nothing.
        $this->followingRedirects()->post($approveUrl)->assertOk();
        $this->assertSame(SocialPost::STATUS_PUBLISHED, $post->fresh()->status);
        Http::assertSentCount(1);
    }

    public function test_reject_cancels_and_a_bad_or_old_link_is_refused(): void
    {
        $post = $this->draftForApproval();
        $link = app(SocialPostApproval::class)->link($post);
        $page = $this->get($link)->assertOk();
        $rejectUrl = html_entity_decode((string) preg_replace('/^.*action="([^"]*\/reject[^"]*)".*$/s', '$1', $page->getContent()));

        $this->followingRedirects()->post($rejectUrl)->assertOk()->assertSee('Rejected');
        $this->assertSame(SocialPost::STATUS_CANCELLED, $post->fresh()->status);
        $this->assertSame(SocialPostDelivery::STATUS_CANCELLED, SocialPostDelivery::firstOrFail()->status);

        $this->get('/social/approve/' . $post->id)->assertForbidden();
        $this->get($link . 'x')->assertForbidden();
        $this->post('/social/approve/' . $post->id . '/approve')->assertForbidden();
        Carbon::setTestNow('2026-09-25 12:01:00');
        $this->get($link)->assertForbidden();
    }

    public function test_publish_now_from_admin_uses_the_same_approval(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['post_id' => 'p1'], 200)]);
        $post = $this->draftForApproval();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson("/api/admin/social/posts/{$post->id}/publish")->assertOk();
        $this->assertSame(SocialPost::STATUS_PUBLISHED, $post->fresh()->status);
    }

    // ── Monday digest ────────────────────────────────────────────────────────

    public function test_the_weekly_digest_sums_up_the_week_for_the_owners(): void
    {
        $this->makeOwner(['phone' => '7770001']);
        $this->makeManager(['phone' => '7770002']);
        $this->makeStaff('cashier', ['phone' => '7770003']);
        $this->facebook->forceFill(['health' => ['status' => 'warning', 'token_expires_at' => now()->addDays(5)->toIso8601String()]])->save();
        $telegram = SocialChannel::create(['platform' => 'telegram', 'name' => 'TG', 'credentials' => ['bot_token' => 'x', 'chat_id' => '1'], 'is_enabled' => true]);

        $best = SocialPost::create(['status' => SocialPost::STATUS_PUBLISHED, 'source' => 'manual', 'snapshot' => ['caption' => 'Masroshi is back on the counter today'], 'published_at' => now()->subDays(2)]);
        $other = SocialPost::create(['status' => SocialPost::STATUS_PUBLISHED, 'source' => 'manual', 'snapshot' => ['caption' => 'Quiet post'], 'published_at' => now()->subDays(4)]);
        $old = SocialPost::create(['status' => SocialPost::STATUS_PUBLISHED, 'source' => 'manual', 'snapshot' => ['caption' => 'Last month'], 'published_at' => now()->subDays(20)]);
        $bestDelivery = SocialPostDelivery::create(['social_post_id' => $best->id, 'social_channel_id' => $this->facebook->id, 'status' => SocialPostDelivery::STATUS_PUBLISHED, 'provider_post_id' => '1', 'published_at' => now()->subDays(2), 'insights' => ['likes' => 12, 'comments' => 1]]);
        SocialPostDelivery::create(['social_post_id' => $best->id, 'social_channel_id' => $telegram->id, 'status' => SocialPostDelivery::STATUS_PUBLISHED, 'provider_post_id' => '2', 'published_at' => now()->subDays(2)]);
        SocialPostDelivery::create(['social_post_id' => $other->id, 'social_channel_id' => $this->facebook->id, 'status' => SocialPostDelivery::STATUS_PUBLISHED, 'provider_post_id' => '3', 'published_at' => now()->subDays(4)]);
        SocialPostDelivery::create(['social_post_id' => $old->id, 'social_channel_id' => $this->facebook->id, 'status' => SocialPostDelivery::STATUS_PUBLISHED, 'provider_post_id' => '4', 'published_at' => now()->subDays(20)]);
        \App\Models\SocialLinkVisit::create(['social_post_delivery_id' => $bestDelivery->id, 'path' => 'menu', 'visitor_hash' => 'a', 'created_at' => now()->subDay()]);
        \App\Models\SocialLinkVisit::create(['social_post_delivery_id' => $bestDelivery->id, 'path' => 'menu', 'visitor_hash' => 'b', 'created_at' => now()->subDay()]);
        SocialComment::create(['social_post_delivery_id' => $bestDelivery->id, 'provider_comment_id' => 'c1', 'text' => 'yum']);
        SocialPost::create(['status' => SocialPost::STATUS_AWAITING_APPROVAL, 'source' => 'auto_special', 'snapshot' => ['caption' => 'Waiting']]);

        $this->artisan('social:weekly-digest')
            ->expectsOutputToContain('Weekly social digest sent to 2 recipient(s).')
            ->assertSuccessful();

        $this->assertCount(2, $this->sent);
        $this->assertStringStartsWith('7770001|', $this->sent[0]);
        $message = substr($this->sent[0], strlen('7770001|'));
        $this->assertSame(
            'Bake & Grill social, last 7 days: 2 posts went out (Facebook 2, Telegram 1). Best: "Masroshi is back on the counter today" (12 likes, 2 visits). Links: 2 visits, 0 orders. 1 comment unread. 1 draft waiting for approval. Facebook "Page": token expires in 5 days. See Social Hub.',
            $message,
        );
        $this->assertStringNotContainsString('7770003', implode(' ', $this->sent), 'a cashier is not an owner');
    }

    public function test_the_digest_is_silent_when_off_or_when_there_is_nothing_to_say(): void
    {
        $this->makeOwner(['phone' => '7770001']);

        $this->artisan('social:weekly-digest')->expectsOutputToContain('Nothing to report.')->assertSuccessful();

        SiteSetting::set('social_weekly_digest', '0');
        SiteSetting::bust();
        SocialPost::create(['status' => SocialPost::STATUS_AWAITING_APPROVAL, 'source' => 'auto_special', 'snapshot' => ['caption' => 'Waiting']]);
        $this->artisan('social:weekly-digest')->expectsOutputToContain('Weekly social digest is off.')->assertSuccessful();
        $this->assertCount(0, $this->sent);

        $this->artisan('social:weekly-digest --force')->expectsOutputToContain('No posts went out. 1 draft waiting for approval.')->assertSuccessful();
        $this->assertCount(1, $this->sent);
    }

    public function test_the_two_switches_round_trip_through_the_rules_endpoint(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->getJson('/api/admin/social/rules')->assertOk()
            ->assertJsonPath('rules.approval_sms', true)->assertJsonPath('rules.weekly_digest', true);
        $this->putJson('/api/admin/social/rules', ['approval_sms' => false, 'weekly_digest' => false])->assertOk()
            ->assertJsonPath('rules.approval_sms', false)->assertJsonPath('rules.weekly_digest', false);
        $this->getJson('/api/admin/social/rules')->assertOk()->assertJsonPath('rules.weekly_digest', false);
        $this->putJson('/api/admin/social/rules', ['approval_sms' => 'maybe'])->assertStatus(422);
    }

    // ── Dry run ──────────────────────────────────────────────────────────────

    public function test_a_dry_run_channel_records_what_it_would_have_posted_and_sends_nothing(): void
    {
        Http::fake();
        config(['social.publish_allowed' => false]);
        $this->facebook->forceFill(['dry_run' => true, 'is_test_channel' => false])->save();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $item = Item::factory()->create(['name' => 'Masroshi']);

        $created = $this->postJson('/api/admin/social/posts', [
            'caption' => 'Rehearsal: ' . url('/menu/' . $item->id),
            'item_id' => $item->id,
            'channel_ids' => [$this->facebook->id],
            'action' => 'now',
        ])->assertCreated();

        Http::assertNothingSent();
        $delivery = SocialPostDelivery::firstOrFail();
        $this->assertSame(SocialPostDelivery::STATUS_DRY_RUN, $delivery->status);
        $this->assertNull($delivery->error_class, 'the environment guard was never consulted');
        $this->assertStringStartsWith('Dry run — would have posted (photo): Rehearsal: ' . url('/menu/' . $item->id) . '?s=' . $delivery->id, (string) $delivery->error_message);
        $this->assertNotNull($delivery->published_at);
        $this->assertSame(SocialPost::STATUS_PUBLISHED, SocialPost::firstOrFail()->status, 'a dry run counts as done, not failed');

        $list = $this->getJson('/api/admin/social/posts')->assertOk();
        $this->assertTrue($list->json('posts.0.dry_run'));
        $this->assertSame('dry_run', $list->json('posts.0.deliveries.0.status'));
        $this->assertSame($created->json('post.id'), $list->json('posts.0.id'));
    }

    public function test_dry_run_round_trips_on_the_channel_and_shows_in_the_list(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->patchJson("/api/admin/social/channels/{$this->facebook->id}", ['dry_run' => true])->assertOk()
            ->assertJsonPath('channel.dry_run', true);
        $this->assertTrue($this->facebook->fresh()->dry_run);
        $this->getJson('/api/admin/social/channels')->assertOk()->assertJsonPath('channels.0.dry_run', true);

        $res = $this->postJson('/api/admin/social/channels', [
            'platform' => 'telegram', 'name' => 'Rehearsal bot', 'dry_run' => true,
            'credentials' => ['bot_token' => 'x', 'chat_id' => '1'],
        ])->assertCreated();
        $this->assertTrue($res->json('channel.dry_run'));
    }
}
