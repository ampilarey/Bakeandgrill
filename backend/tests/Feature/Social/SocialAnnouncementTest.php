<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Signage\Services\SignageNotices;
use App\Models\DailySpecial;
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
 * Owner's shortlist, 2026-09-24: one announcement to the channels and the
 * TV board at once, with starter texts filled from the real hours; and
 * "Share" from a special opening the composer on its item.
 */
class SocialAnnouncementTest extends TestCase
{
    use RefreshDatabase;

    private SocialChannel $facebook;

    private SocialChannel $instagram;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        config(['social.publish_allowed' => true]);
        Carbon::setTestNow('2026-09-24 10:00:00'); // Thursday
        $this->facebook = SocialChannel::create([
            'platform' => 'facebook', 'name' => 'Page',
            'credentials' => ['page_id' => '1', 'access_token' => 't'], 'is_enabled' => true, 'is_test_channel' => true,
        ]);
        $this->instagram = SocialChannel::create([
            'platform' => 'instagram', 'name' => 'IG',
            'credentials' => ['ig_user_id' => '9', 'access_token' => 't'], 'is_enabled' => true, 'is_test_channel' => true,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_templates_are_filled_from_the_real_hours_and_closures(): void
    {
        SiteSetting::set('business_hours_json', json_encode([
            ['day' => 0, 'open' => '07:00', 'close' => '22:00', 'closed' => false],
            ['day' => 1, 'open' => '07:00', 'close' => '22:00', 'closed' => false],
            ['day' => 2, 'open' => '07:00', 'close' => '22:00', 'closed' => false],
            ['day' => 3, 'open' => '07:00', 'close' => '22:00', 'closed' => false],
            ['day' => 4, 'open' => '07:00', 'close' => '22:00', 'closed' => false],
            ['day' => 5, 'open' => '14:00', 'close' => '22:00', 'closed' => false],
            ['day' => 6, 'open' => '07:00', 'close' => '22:00', 'closed' => false],
        ]));
        SiteSetting::bust();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $templates = collect($this->getJson('/api/admin/social/announcements/templates')->assertOk()->json('templates'))->keyBy('key');

        $this->assertStringContainsString('Back tomorrow at 2:00 PM', $templates['closed_today']['text'], 'Friday opens at 14:00');
        $this->assertSame('warning', $templates['closed_today']['look']);
        $this->assertStringContainsString('at 10:00 PM', $templates['closing_early']['text']);
        $this->assertStringContainsString('Sun–Thu 7:00 AM–10:00 PM, Fri 2:00 PM–10:00 PM, Sat 7:00 AM–10:00 PM', $templates['hours']['text']);
        $this->assertSame('', $templates['custom']['text']);
    }

    public function test_an_announcement_goes_to_the_channels_and_the_tv_board_and_skips_instagram(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['post_id' => 'p1'], 200)]);
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $res = $this->postJson('/api/admin/social/announcements', [
            'text' => "We're closed today (Eid). Back tomorrow at 7:00 AM.",
            'text_dv' => 'މިއަދު ބަންދު',
            'template' => 'closed_today',
            'channel_ids' => [$this->facebook->id, $this->instagram->id],
            'action' => 'now',
            'signage' => ['enabled' => true, 'look' => 'warning', 'show' => 'both', 'seconds' => 12, 'minutes' => 120],
        ])->assertCreated();

        $this->assertSame(['IG'], $res->json('skipped_channels'), 'Instagram needs a photo');
        $post = SocialPost::findOrFail($res->json('post_id'));
        $this->assertSame('announcement', $post->source);
        $this->assertSame('closed_today', $post->source_ref);
        $this->assertSame("We're closed today (Eid). Back tomorrow at 7:00 AM.", $post->snapshot['caption']);
        $this->assertSame('މިއަދު ބަންދު', $post->snapshot['caption_dv'], 'kept apart so each channel takes its own language');
        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, SocialPostDelivery::firstOrFail()->status);
        $this->assertSame(1, SocialPostDelivery::count(), 'no Instagram delivery');

        $notices = SignageNotices::all();
        $this->assertCount(1, $notices);
        $this->assertSame("We're closed today (Eid). Back tomorrow at 7:00 AM.", $notices[0]['text']);
        $this->assertSame('މިއަދު ބަންދު', $notices[0]['text_dv']);
        $this->assertSame('warning', $notices[0]['look']);
        $this->assertSame(12, $notices[0]['seconds']);
        $this->assertSame(now()->addMinutes(120)->toIso8601String(), $notices[0]['expires_at']);
        $this->assertSame($notices[0]['id'], $res->json('notice.id'));
    }

    public function test_tv_only_needs_signage_permission_and_social_only_needs_compose(): void
    {
        // A cashier given social.view + social.compose, but no signage.manage.
        $staff = $this->makeStaff('cashier');
        foreach (['social.view', 'social.compose'] as $slug) {
            $staff->permissions()->attach(\App\Models\Permission::where('slug', $slug)->firstOrFail()->id, ['granted' => true]);
        }
        Sanctum::actingAs($staff, ['staff']);

        // They can draft to the channels…
        $this->postJson('/api/admin/social/announcements', [
            'text' => 'New hours from Monday', 'channel_ids' => [$this->facebook->id], 'action' => 'draft',
        ])->assertCreated();
        $this->assertSame(SocialPost::STATUS_DRAFT, SocialPost::firstOrFail()->status);

        // … but not touch the TV board.
        $this->postJson('/api/admin/social/announcements', [
            'text' => 'New hours from Monday', 'signage' => ['enabled' => true],
        ])->assertStatus(403);

        // Nothing chosen is refused.
        $this->postJson('/api/admin/social/announcements', ['text' => 'x'])->assertStatus(422);

        // TV only, from the owner: no post, one notice with a 160-character line.
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $long = str_repeat('Kitchen closes early tonight. ', 10);
        $res = $this->postJson('/api/admin/social/announcements', [
            'text' => $long, 'signage' => ['enabled' => true, 'minutes' => 0],
        ])->assertCreated();
        $this->assertNull($res->json('post_id'));
        $this->assertLessThanOrEqual(160, mb_strlen($res->json('notice.text')));
        $this->assertNull($res->json('notice.expires_at'));
    }

    public function test_share_a_special_opens_the_composer_on_its_item_with_the_offer_to_hand(): void
    {
        $item = Item::factory()->create(['name' => 'Masroshi', 'base_price' => 50]);
        $special = DailySpecial::create([
            'item_id' => $item->id, 'badge_label' => 'Today only', 'special_price' => 40,
            'start_date' => now()->subDay()->toDateString(), 'end_date' => now()->addDays(2)->toDateString(), 'is_active' => true,
        ]);
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $res = $this->getJson('/api/admin/social/item-preview?special_id=' . $special->id)->assertOk();
        $this->assertSame($item->id, $res->json('item.id'));
        $this->assertSame(40.0, (float) $res->json('item.price'), 'the special price, frozen');
        $this->assertSame('Today only', $res->json('item.special.badge_label'));
        $this->assertSame(now()->addDays(2)->toDateString(), $res->json('item.special.end_date'));
        $this->assertTrue($res->json('item.special.is_active'));

        $this->assertNull($this->getJson('/api/admin/social/item-preview?item_id=' . $item->id)->json('item.special'));
        $this->getJson('/api/admin/social/item-preview')->assertStatus(422);
    }
}
