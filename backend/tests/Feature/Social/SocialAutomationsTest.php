<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Social\Services\FeaturedItemAutoPoster;
use App\Domains\Social\Services\NewItemAutoPoster;
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
 * Social Hub audit, 2026-09-24: two more automations beside the daily
 * special. "New on the menu" announces each recent, photographed item
 * once; "Chef's pick" rotates the featured items on chosen weekdays.
 * Both draft for approval by default and never post twice in a day.
 */
class SocialAutomationsTest extends TestCase
{
    use RefreshDatabase;

    private SocialChannel $facebook;

    private SocialChannel $instagram;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        config(['social.publish_allowed' => true]);
        Carbon::setTestNow('2026-09-24 12:00:00'); // a Thursday
        $this->facebook = SocialChannel::create([
            'platform' => 'facebook', 'name' => 'Page',
            'credentials' => ['page_id' => '1', 'access_token' => 't'],
            'is_enabled' => true, 'is_test_channel' => true,
        ]);
        $this->instagram = SocialChannel::create([
            'platform' => 'instagram', 'name' => 'IG',
            'credentials' => ['ig_user_id' => '9', 'access_token' => 't'],
            'is_enabled' => true, 'is_test_channel' => true,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function enable(string $kind, array $extra = []): void
    {
        SiteSetting::set("social_auto_{$kind}_enabled", '1');
        SiteSetting::set("social_auto_{$kind}_channel_ids", json_encode([$this->facebook->id, $this->instagram->id]));
        foreach ($extra as $key => $value) {
            SiteSetting::set("social_auto_{$kind}_{$key}", is_array($value) ? json_encode($value) : (string) $value);
        }
        SiteSetting::bust();
    }

    /** An off-site JPEG counts as a real photo (SocialPreviewImage trusts off-site URLs). */
    private function photographed(array $attrs = []): Item
    {
        return Item::factory()->create(array_merge(['image_url' => 'https://cdn.example.com/' . uniqid() . '.jpg'], $attrs));
    }

    // ── New on the menu ──────────────────────────────────────────────────────

    public function test_new_item_announces_the_oldest_unannounced_photographed_item_once_a_day(): void
    {
        $this->enable('new_item');
        $old = $this->photographed(['name' => 'Old dish', 'created_at' => now()->subDays(40)]);
        $bare = Item::factory()->create(['name' => 'No photo', 'created_at' => now()->subDays(3)]);
        $first = $this->photographed(['name' => 'First new', 'base_price' => 25, 'created_at' => now()->subDays(5)]);
        $second = $this->photographed(['name' => 'Second new', 'created_at' => now()->subDays(2)]);

        $poster = app(NewItemAutoPoster::class);
        $post = $poster->run();

        $this->assertNotNull($post);
        $this->assertSame('item:' . $first->id, $post->source_ref, 'oldest new photographed item first');
        $this->assertSame(SocialPost::STATUS_AWAITING_APPROVAL, $post->status);
        $this->assertStringContainsString('New on the menu: First new — MVR 25.00', $post->snapshot['caption']);
        $this->assertSame($first->image_url, $post->snapshot['image_url']);
        $this->assertCount(2, SocialPostDelivery::all(), 'a photographed item reaches Instagram too');

        $this->assertNull($poster->run(), 'one per day');

        Carbon::setTestNow('2026-09-25 12:00:00');
        $this->assertSame('item:' . $second->id, $poster->run()?->source_ref, 'next day, the next item');

        Carbon::setTestNow('2026-09-26 12:00:00');
        $this->assertNull($poster->run(), 'nothing left: the old dish is outside the window, the bare one has no photo');
        $this->assertSame(0, SocialPost::where('source_ref', 'item:' . $old->id)->count());
        $this->assertSame(0, SocialPost::where('source_ref', 'item:' . $bare->id)->count());
    }

    public function test_new_item_window_is_configurable(): void
    {
        $this->enable('new_item', ['max_age_days' => 60]);
        $old = $this->photographed(['created_at' => now()->subDays(40)]);

        $this->assertSame('item:' . $old->id, app(NewItemAutoPoster::class)->run()?->source_ref);
    }

    // ── Chef's pick ──────────────────────────────────────────────────────────

    public function test_featured_posts_only_on_chosen_days_and_rotates_least_recent_first(): void
    {
        $this->enable('featured', ['days' => [5]]); // Fridays only
        $a = $this->photographed(['name' => 'Pick A', 'is_featured' => true]);
        $b = $this->photographed(['name' => 'Pick B', 'is_featured' => true]);
        $this->photographed(['name' => 'Not featured']);
        $poster = app(FeaturedItemAutoPoster::class);

        $this->assertNull($poster->run(), 'Thursday: not a chosen day');

        Carbon::setTestNow('2026-09-25 12:00:00'); // Friday
        $first = $poster->run();
        $this->assertNotNull($first);
        $this->assertSame('item:' . $a->id, $first->source_ref);
        $this->assertStringContainsString("Chef's pick: Pick A", $first->snapshot['caption']);

        Carbon::setTestNow('2026-10-02 12:00:00'); // next Friday
        $this->assertSame('item:' . $b->id, $poster->run()?->source_ref, 'the other pick goes next');

        Carbon::setTestNow('2026-10-09 12:00:00');
        $this->assertSame('item:' . $a->id, $poster->run()?->source_ref, 'then back round');
    }

    public function test_featured_draft_is_skipped_if_the_item_stops_being_a_pick_before_approval(): void
    {
        Http::fake();
        $this->enable('featured');
        $item = $this->photographed(['is_featured' => true]);
        $post = app(FeaturedItemAutoPoster::class)->run();
        $this->assertNotNull($post);

        $item->update(['is_featured' => false]);
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->postJson("/api/admin/social/posts/{$post->id}/publish")->assertOk();

        $delivery = SocialPostDelivery::firstOrFail();
        $this->assertSame(SocialPostDelivery::STATUS_SKIPPED, $delivery->status);
        $this->assertStringContainsString("no longer a chef's pick", (string) $delivery->error_message);
        Http::assertNothingSent();
    }

    public function test_unattended_new_item_posts_without_a_human(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['post_id' => 'p1'], 200)]);
        SiteSetting::set('social_auto_new_item_unattended', '1');
        SiteSetting::set('social_auto_new_item_channel_ids', json_encode([$this->facebook->id]));
        SiteSetting::set('social_auto_new_item_enabled', '1');
        SiteSetting::bust();
        $this->photographed(['created_at' => now()->subDay()]);

        app(NewItemAutoPoster::class)->run();

        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, SocialPostDelivery::firstOrFail()->status);
    }

    // ── Command and settings ─────────────────────────────────────────────────

    public function test_the_command_fires_each_automation_at_its_own_time(): void
    {
        $this->enable('new_item', ['time' => '12:00']);
        $this->enable('featured', ['time' => '18:00']);
        $this->photographed(['created_at' => now()->subDay()]);
        $this->photographed(['is_featured' => true]);

        $this->artisan('social:run-automations')->assertSuccessful();

        $this->assertSame(1, SocialPost::where('source', 'auto_new_item')->count());
        $this->assertSame(0, SocialPost::where('source', 'auto_featured')->count(), 'not its time yet');

        $this->artisan('social:run-automations --force')->assertSuccessful();
        $this->assertSame(1, SocialPost::where('source', 'auto_featured')->count());
    }

    public function test_settings_endpoint_round_trips_every_kind_and_keeps_the_old_shape(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->putJson('/api/admin/social/automation', [
            'kind' => 'featured', 'enabled' => true, 'time' => '13:15', 'days' => [1, 3, 5],
            'channel_ids' => [$this->facebook->id], 'template' => 'Pick: {item}', 'unattended' => false,
        ])->assertOk();
        $this->putJson('/api/admin/social/automation', [
            'kind' => 'new_item', 'enabled' => true, 'max_age_days' => 30,
        ])->assertOk();
        $this->putJson('/api/admin/social/automation', ['time' => '10:30'])->assertOk(); // no kind: the special

        $res = $this->getJson('/api/admin/social/automation')->assertOk();
        $this->assertSame('10:30', $res->json('automation.time'));
        $this->assertSame('10:30', $res->json('automations.special.time'));
        $this->assertSame([1, 3, 5], $res->json('automations.featured.days'));
        $this->assertSame('13:15', $res->json('automations.featured.time'));
        $this->assertSame('Pick: {item}', $res->json('automations.featured.template'));
        $this->assertSame(30, $res->json('automations.new_item.max_age_days'));
        $this->assertTrue($res->json('automations.new_item.enabled'));

        $this->putJson('/api/admin/social/automation', ['kind' => 'bogus'])->assertStatus(422);
        $this->putJson('/api/admin/social/automation', ['kind' => 'featured', 'days' => [7]])->assertStatus(422);
    }
}
