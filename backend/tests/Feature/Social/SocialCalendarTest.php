<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Social\Services\NewItemAutoPoster;
use App\Domains\Social\Services\SocialPostingRules;
use App\Models\Item;
use App\Models\SiteSetting;
use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner's shortlist, 2026-09-24: the content calendar, spacing rules
 * between posts, and best-time hints from the stored insights.
 */
class SocialCalendarTest extends TestCase
{
    use RefreshDatabase;

    private SocialChannel $facebook;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        config(['social.publish_allowed' => true]);
        Carbon::setTestNow('2026-09-24 12:00:00'); // Thursday, Maldives
        $this->facebook = SocialChannel::create([
            'platform' => 'facebook', 'name' => 'Page',
            'credentials' => ['page_id' => '1', 'access_token' => 't'], 'is_enabled' => true, 'is_test_channel' => true,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function published(string $at, array $insights = []): SocialPost
    {
        $post = SocialPost::create(['status' => SocialPost::STATUS_PUBLISHED, 'snapshot' => ['caption' => 'x'], 'source' => 'manual', 'published_at' => Carbon::parse($at)]);
        SocialPostDelivery::create([
            'social_post_id' => $post->id, 'social_channel_id' => $this->facebook->id,
            'status' => SocialPostDelivery::STATUS_PUBLISHED, 'published_at' => Carbon::parse($at),
            'insights' => $insights ?: null,
        ]);

        return $post;
    }

    private function rules(int $gap, int $perDay = 0): void
    {
        SiteSetting::set(SocialPostingRules::GAP_KEY, (string) $gap);
        SiteSetting::set(SocialPostingRules::PER_DAY_KEY, (string) $perDay);
        SiteSetting::bust();
    }

    // ── Rules ────────────────────────────────────────────────────────────────

    public function test_the_gap_rule_names_the_neighbour_and_finds_the_next_free_slot(): void
    {
        $this->rules(120);
        $near = $this->published('2026-09-24 11:20:00');
        $rules = app(SocialPostingRules::class);

        $this->assertStringContainsString("Post #{$near->id} went out 40 min before this one; the rule is at least 120 min apart.", (string) $rules->conflict(now()));
        $this->assertSame('2026-09-24 13:30:00', $rules->nextFreeSlot(now())?->toDateTimeString(), '11:20 + 120 min, rounded up to the quarter hour');
        $this->assertNull($rules->conflict(now()->addHours(3)));
    }

    public function test_the_per_day_rule_counts_what_went_out_and_what_is_due(): void
    {
        $this->rules(0, 2);
        $this->published('2026-09-24 08:00:00');
        SocialPost::create(['status' => SocialPost::STATUS_SCHEDULED, 'snapshot' => ['caption' => 'later'], 'source' => 'manual', 'scheduled_at' => Carbon::parse('2026-09-24 20:00:00')]);
        $rules = app(SocialPostingRules::class);

        $this->assertStringContainsString('Already 2 posts on Thu 24 Sep; the rule is at most 2 a day.', (string) $rules->conflict(now()));
        $this->assertSame('2026-09-25', $rules->nextFreeSlot(now())?->toDateString(), 'tomorrow is the next free day');
    }

    public function test_post_now_is_offered_the_next_slot_and_can_insist(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['post_id' => 'p1'], 200)]);
        $this->rules(60);
        $this->published('2026-09-24 11:45:00');
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $body = ['caption' => 'Now please', 'channel_ids' => [$this->facebook->id], 'action' => 'now'];

        $res = $this->postJson('/api/admin/social/posts', $body)->assertStatus(409);
        $this->assertStringContainsString('15 min before', $res->json('message'));
        $this->assertSame('2026-09-24T12:45:00+05:00', $res->json('next_free_at'));
        $this->assertSame(1, SocialPost::count(), 'nothing was created');

        $this->postJson('/api/admin/social/posts', $body + ['force' => true])->assertCreated();
        $this->assertSame(2, SocialPost::count());
        $this->postJson('/api/admin/social/posts', ['caption' => 'draft is fine', 'channel_ids' => [$this->facebook->id], 'action' => 'draft'])->assertCreated();
    }

    public function test_an_unattended_automation_is_moved_to_the_next_free_slot_and_still_goes_out(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['post_id' => 'p1'], 200)]);
        $this->rules(120);
        $this->published('2026-09-24 11:30:00');
        SiteSetting::set('social_auto_new_item_enabled', '1');
        SiteSetting::set('social_auto_new_item_unattended', '1');
        SiteSetting::set('social_auto_new_item_channel_ids', json_encode([$this->facebook->id]));
        SiteSetting::bust();
        Item::factory()->create(['image_url' => 'https://cdn.example.com/new.jpg', 'created_at' => now()->subDay()]);

        $post = app(NewItemAutoPoster::class)->run();

        $this->assertNotNull($post);
        $this->assertSame(SocialPost::STATUS_SCHEDULED, $post->status);
        $this->assertSame('2026-09-24 13:30:00', $post->scheduled_at->toDateTimeString());
        $delivery = SocialPostDelivery::where('social_post_id', $post->id)->firstOrFail();
        $this->assertSame(SocialPostDelivery::STATUS_SCHEDULED, $delivery->status);
        $this->assertNotNull($delivery->dedupe_key, 'the per-day dedupe still holds');
        Http::assertNothingSent();

        Carbon::setTestNow('2026-09-24 13:31:00');
        $this->artisan('social:publish-due')->assertSuccessful();
        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, $delivery->fresh()->status);
    }

    public function test_rules_round_trip_through_the_endpoint(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->putJson('/api/admin/social/rules', ['min_gap_minutes' => 240, 'max_per_day' => 1])->assertOk()
            ->assertJsonPath('rules.min_gap_minutes', 240)->assertJsonPath('rules.max_per_day', 1);
        $this->getJson('/api/admin/social/rules')->assertOk()->assertJsonPath('rules.max_per_day', 1);
        $this->putJson('/api/admin/social/rules', ['max_per_day' => 99])->assertStatus(422);
    }

    // ── Calendar ─────────────────────────────────────────────────────────────

    public function test_the_calendar_lists_dated_posts_drafts_and_automation_slots(): void
    {
        $this->published('2026-09-22 09:15:00');
        SocialPost::create(['status' => SocialPost::STATUS_SCHEDULED, 'snapshot' => ['caption' => 'Friday post'], 'source' => 'manual', 'scheduled_at' => Carbon::parse('2026-09-25 18:00:00')]);
        SocialPost::create(['status' => SocialPost::STATUS_DRAFT, 'snapshot' => ['caption' => 'Some day'], 'source' => 'manual']);
        SocialPost::create(['status' => SocialPost::STATUS_PUBLISHED, 'snapshot' => ['caption' => 'old'], 'source' => 'manual', 'published_at' => Carbon::parse('2026-08-01 09:00:00')]);
        SiteSetting::set('social_auto_featured_enabled', '1');
        SiteSetting::set('social_auto_featured_channel_ids', json_encode([$this->facebook->id]));
        SiteSetting::set('social_auto_featured_days', json_encode([5]));
        SiteSetting::set('social_auto_featured_time', '12:30');
        SiteSetting::bust();
        Sanctum::actingAs($this->makeManager(), ['staff']);

        $res = $this->getJson('/api/admin/social/calendar?from=2026-09-21&to=2026-09-27')->assertOk();

        $posts = collect($res->json('posts'));
        $this->assertCount(2, $posts, 'the August post is out of range; the draft has no date');
        $this->assertSame(['2026-09-22', '2026-09-25'], $posts->pluck('date')->all());
        $this->assertSame('18:00', $posts[1]['time']);
        $this->assertSame('Friday post', $posts[1]['caption']);
        $this->assertSame(['facebook'], $posts[0]['platforms']);
        $this->assertSame(['Some day'], collect($res->json('drafts'))->pluck('caption')->all());
        $this->assertSame([['kind' => 'featured', 'date' => '2026-09-25', 'time' => '12:30']], $res->json('slots'));
        $this->assertSame(0, $res->json('rules.min_gap_minutes'));
        $this->assertFalse($res->json('best_times.enough'));

        $this->getJson('/api/admin/social/calendar?from=2026-01-01&to=2026-12-31')->assertStatus(422);
    }

    public function test_a_post_can_be_moved_to_another_day_keeping_its_time(): void
    {
        $this->rules(60);
        $post = SocialPost::create(['status' => SocialPost::STATUS_SCHEDULED, 'snapshot' => ['caption' => 'x'], 'source' => 'manual', 'scheduled_at' => Carbon::parse('2026-09-25 18:00:00')]);
        SocialPostDelivery::create(['social_post_id' => $post->id, 'social_channel_id' => $this->facebook->id, 'status' => SocialPostDelivery::STATUS_SCHEDULED]);
        $this->published('2026-09-26 17:30:00');
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $res = $this->postJson("/api/admin/social/posts/{$post->id}/move", ['date' => '2026-09-26'])->assertOk();
        $this->assertSame('2026-09-26', $res->json('post.date'));
        $this->assertSame('18:00', $res->json('post.time'));
        $this->assertStringContainsString('30 min before', $res->json('warning'), 'moved, but told about the neighbour');

        // A draft picks up a time and becomes scheduled.
        $draft = SocialPost::create(['status' => SocialPost::STATUS_DRAFT, 'snapshot' => ['caption' => 'd'], 'source' => 'manual']);
        SocialPostDelivery::create(['social_post_id' => $draft->id, 'social_channel_id' => $this->facebook->id, 'status' => SocialPostDelivery::STATUS_SCHEDULED]);
        $res = $this->postJson("/api/admin/social/posts/{$draft->id}/move", ['date' => '2026-09-28', 'time' => '09:30'])->assertOk();
        $this->assertSame('scheduled', $res->json('post.status'));
        $this->assertSame('09:30', $res->json('post.time'));

        $this->postJson("/api/admin/social/posts/{$draft->id}/move", ['date' => '2026-09-20'])->assertStatus(422);
    }

    // ── Best times ───────────────────────────────────────────────────────────

    public function test_best_times_need_five_scored_posts_then_rank_the_hours(): void
    {
        foreach (['2026-09-10 12:10:00', '2026-09-11 12:40:00', '2026-09-12 20:05:00'] as $at) {
            $this->published($at, ['likes' => 30, 'comments' => 5, 'shares' => 2]);
        }
        Sanctum::actingAs($this->makeManager(), ['staff']);
        $this->assertFalse($this->getJson('/api/admin/social/best-times')->json('best_times.enough'));

        $this->published('2026-09-13 08:00:00', ['likes' => 2, 'comments' => 0]);
        $this->published('2026-09-14 20:30:00', ['likes' => 25, 'comments' => 4, 'shares' => 1]);
        $this->published('2026-09-15 15:00:00'); // no insights: not counted

        $res = $this->getJson('/api/admin/social/best-times')->assertOk();
        $this->assertTrue($res->json('best_times.enough'));
        $this->assertSame(5, $res->json('best_times.sample'));
        $this->assertSame([12, 20], $res->json('best_times.top_hours'));
        $this->assertSame(8, collect($res->json('best_times.hours'))->last()['hour']);
    }
}
