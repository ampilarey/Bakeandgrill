<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Social\Services\WeeklyMenuAutoPoster;
use App\Models\DailySpecial;
use App\Models\Item;
use App\Models\SiteSetting;
use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner's shortlist, 2026-09-24: back-in-stock posts, the weekly specials
 * card, and a Dhivehi caption with a language per channel.
 */
class SocialStockWeeklyLanguageTest extends TestCase
{
    use RefreshDatabase;

    private SocialChannel $facebook;

    private SocialChannel $viber;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        config(['social.publish_allowed' => true]);
        Carbon::setTestNow('2026-09-27 09:00:00'); // a Sunday
        $this->facebook = SocialChannel::create([
            'platform' => 'facebook', 'name' => 'Page',
            'credentials' => ['page_id' => '1', 'access_token' => 't'], 'is_enabled' => true, 'is_test_channel' => true,
        ]);
        $this->viber = SocialChannel::create([
            'platform' => 'viber', 'name' => 'Viber',
            'credentials' => ['auth_token' => 'v', 'sender_id' => 's'], 'is_enabled' => true, 'is_test_channel' => true, 'language' => 'dv',
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
        SiteSetting::set("social_auto_{$kind}_channel_ids", json_encode([$this->facebook->id]));
        foreach ($extra as $k => $v) {
            SiteSetting::set("social_auto_{$kind}_{$k}", is_array($v) ? json_encode($v) : (string) $v);
        }
        SiteSetting::bust();
    }

    // ── Back in stock ────────────────────────────────────────────────────────

    public function test_a_chefs_pick_that_was_gone_long_enough_is_announced_once_when_it_returns(): void
    {
        $this->enable('stock');
        $item = Item::factory()->create(['name' => 'Kulhi Boakibaa', 'is_featured' => true, 'image_url' => 'https://cdn.example.com/kb.jpg', 'is_available' => true]);

        $item->update(['is_available' => false]);
        $this->assertSame(0, SocialPost::count(), 'going out posts nothing');

        Carbon::setTestNow('2026-09-27 10:00:00');
        $item->update(['is_available' => true]);
        $this->assertSame(0, SocialPost::count(), 'back after an hour: not news (min 4 h)');

        $item->update(['is_available' => false]);
        Carbon::setTestNow('2026-09-27 16:00:00');
        $item->update(['is_available' => true]);

        $post = SocialPost::firstOrFail();
        $this->assertSame('auto_stock', $post->source);
        $this->assertSame('item:' . $item->id, $post->source_ref);
        $this->assertSame(SocialPost::STATUS_AWAITING_APPROVAL, $post->status);
        $this->assertStringContainsString('Kulhi Boakibaa is back!', $post->snapshot['caption']);

        // Flapping again the same day does not post twice.
        $item->update(['is_available' => false]);
        Carbon::setTestNow('2026-09-27 22:00:00');
        $item->update(['is_available' => true]);
        $this->assertSame(1, SocialPost::count());
    }

    public function test_back_in_stock_ignores_ordinary_items_unless_told_and_never_breaks_the_save(): void
    {
        $this->enable('stock', ['min_out_hours' => 0]);
        $plain = Item::factory()->create(['is_featured' => false, 'is_available' => false]);
        $plain->update(['is_available' => true]);
        $this->assertSame(0, SocialPost::count(), 'not a chef\'s pick');

        SiteSetting::set('social_auto_stock_featured_only', '0');
        SiteSetting::bust();
        $plain->update(['is_available' => false]);
        $plain->update(['is_available' => true]);
        $this->assertSame(1, SocialPost::count());
        $this->assertTrue($plain->fresh()->is_available, 'the item save went through');
    }

    // ── Weekly card ──────────────────────────────────────────────────────────

    public function test_the_weekly_card_lists_the_weeks_specials_with_a_picture_and_posts_on_its_day(): void
    {
        Storage::fake('public');
        $this->enable('weekly', ['days' => [0], 'time' => '09:00']);
        $a = Item::factory()->create(['name' => 'Masroshi', 'name_dv' => 'މަސްރޮށި', 'base_price' => 50]);
        $b = Item::factory()->create(['name' => 'Kulhi Boakibaa', 'base_price' => 30]);
        DailySpecial::create(['item_id' => $a->id, 'badge_label' => 'Weekend', 'special_price' => 40, 'start_date' => '2026-09-25', 'end_date' => '2026-10-10', 'is_active' => true, 'days_of_week' => [5, 6]]);
        DailySpecial::create(['item_id' => $b->id, 'discount_pct' => 10, 'start_date' => '2026-09-29', 'end_date' => '2026-10-01', 'is_active' => true]);
        DailySpecial::create(['item_id' => $b->id, 'special_price' => 1, 'start_date' => '2026-11-01', 'end_date' => '2026-11-05', 'is_active' => true]);

        $post = app(WeeklyMenuAutoPoster::class)->run();

        $this->assertNotNull($post);
        $this->assertSame('auto_weekly', $post->source);
        $caption = $post->snapshot['caption'];
        $this->assertStringContainsString('• Masroshi — MVR 40.00 (Fri–Sat)', $caption);
        $this->assertStringContainsString('• Kulhi Boakibaa — MVR 27.00 (Tue 29–Thu 1)', $caption);
        $this->assertStringNotContainsString('MVR 1.00', $caption, 'November is not this week');
        $this->assertNotNull($post->snapshot['image_url']);
        $this->assertStringContainsString('social-cards/weekly-2026-09-27.jpg', $post->snapshot['image_url']);
        Storage::disk('public')->assertExists('social-cards/weekly-2026-09-27.jpg');
        $this->assertGreaterThan(5000, strlen(Storage::disk('public')->get('social-cards/weekly-2026-09-27.jpg')), 'a real JPEG, not a stub');
        $this->assertSame(url('/menu'), $post->snapshot['link_url']);

        $this->assertNull(app(WeeklyMenuAutoPoster::class)->run(), 'once a day');

        Carbon::setTestNow('2026-09-28 09:00:00'); // Monday: not a chosen day
        $this->assertNull(app(WeeklyMenuAutoPoster::class)->run());
    }

    public function test_the_weekly_card_posts_nothing_in_a_week_without_specials_and_survives_approval(): void
    {
        Storage::fake('public');
        Http::fake(['graph.facebook.com/*' => Http::response(['post_id' => 'p1'], 200)]);
        $this->enable('weekly', ['days' => [0]]);
        $this->assertNull(app(WeeklyMenuAutoPoster::class)->run());

        $item = Item::factory()->create(['base_price' => 20]);
        DailySpecial::create(['item_id' => $item->id, 'special_price' => 15, 'start_date' => '2026-09-27', 'end_date' => '2026-09-30', 'is_active' => true]);
        $post = app(WeeklyMenuAutoPoster::class)->run();

        // The stale check must not refuse a post that has no single item.
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->postJson("/api/admin/social/posts/{$post->id}/publish")->assertOk();
        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, SocialPostDelivery::firstOrFail()->status);
    }

    public function test_the_command_and_calendar_know_the_new_kinds(): void
    {
        $this->enable('weekly', ['days' => [0], 'time' => '09:00']);
        $this->enable('stock');
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $slots = $this->getJson('/api/admin/social/calendar?from=2026-09-27&to=2026-10-03')->assertOk()->json('slots');
        $this->assertSame([['kind' => 'weekly', 'date' => '2026-09-27', 'time' => '09:00']], $slots, 'stock has no time of day');

        $res = $this->putJson('/api/admin/social/automation', ['kind' => 'stock', 'featured_only' => false, 'min_out_hours' => 12])->assertOk();
        $this->assertFalse($res->json('automations.stock.featured_only'));
        $this->assertSame(12, $res->json('automations.stock.min_out_hours'));
        $this->assertSame([0], $res->json('automations.weekly.days'));
    }

    // ── Dhivehi caption and channel language ─────────────────────────────────

    public function test_each_channel_gets_the_caption_in_its_language(): void
    {
        Http::fake([
            'graph.facebook.com/*' => Http::response(['post_id' => 'p1'], 200),
            'chatapi.viber.com/*' => Http::response(['status' => 0, 'message_token' => 't1'], 200),
        ]);
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson('/api/admin/social/posts', [
            'caption' => 'Fresh masroshi every morning',
            'caption_dv' => 'ކޮންމެ ހެނދުނަކު ތާޒާ މަސްރޮށި',
            'channel_ids' => [$this->facebook->id, $this->viber->id],
            'action' => 'now',
        ])->assertCreated();

        Http::assertSent(fn ($r) => str_contains($r->url(), '/1/feed') && $r['message'] === "Fresh masroshi every morning\n\nކޮންމެ ހެނދުނަކު ތާޒާ މަސްރޮށި");
        Http::assertSent(fn ($r) => str_contains($r->url(), '/pa/post') && $r['text'] === 'ކޮންމެ ހެނދުނަކު ތާޒާ މަސްރޮށި');

        // English-only channel, and Dhivehi-only falls back to English when none was written.
        $this->viber->update(['language' => 'en']);
        $post = new SocialPost(['snapshot' => ['caption' => 'EN', 'caption_dv' => 'DV']]);
        $this->assertSame('EN', $post->captionFor($this->viber->fresh()));
        $this->viber->update(['language' => 'dv']);
        $this->assertSame('EN', (new SocialPost(['snapshot' => ['caption' => 'EN']]))->captionFor($this->viber->fresh()));
    }

    public function test_the_limit_is_measured_per_channel_language_and_the_setting_round_trips(): void
    {
        $telegram = SocialChannel::create([
            'platform' => 'telegram', 'name' => 'TG', 'credentials' => ['bot_token' => '1:a', 'chat_id' => '@bg'],
            'is_enabled' => true, 'is_test_channel' => true, 'language' => 'en',
        ]);
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $long = str_repeat('a', 900);

        // 900 English + 900 Dhivehi with a photo: fine for an English-only Telegram (1024), not for "both".
        $this->postJson('/api/admin/social/posts', [
            'caption' => $long, 'caption_dv' => str_repeat('މ', 900), 'image_url' => 'https://bakeandgrill.mv/storage/m.jpg',
            'channel_ids' => [$telegram->id], 'action' => 'draft',
        ])->assertCreated();
        $this->patchJson("/api/admin/social/channels/{$telegram->id}", ['language' => 'both'])->assertOk()->assertJsonPath('channel.language', 'both');
        $this->postJson('/api/admin/social/posts', [
            'caption' => $long, 'caption_dv' => str_repeat('މ', 900), 'image_url' => 'https://bakeandgrill.mv/storage/m.jpg',
            'channel_ids' => [$telegram->id], 'action' => 'draft',
        ])->assertStatus(422);

        $this->patchJson("/api/admin/social/channels/{$telegram->id}", ['language' => 'fr'])->assertStatus(422);
    }
}
