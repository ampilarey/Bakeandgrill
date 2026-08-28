<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Social\Services\DailySpecialAutoPoster;
use App\Models\DailySpecial;
use App\Models\Item;
use App\Models\SiteSetting;
use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The daily-special automation (plan §2c): approval-mode drafting, the
 * per-day dedupe, photo policy, and pre-publish revalidation when the
 * world changes between drafting and approval.
 */
class DailySpecialAutoPostTest extends TestCase
{
    use RefreshDatabase;

    private SocialChannel $facebook;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        config(['social.publish_allowed' => true, 'social.ig_poll_delay' => 0]);

        $this->facebook = SocialChannel::create([
            'platform' => 'facebook',
            'name' => 'Page',
            'credentials' => ['page_id' => '1', 'access_token' => 't'],
            'is_enabled' => true,
            'is_test_channel' => true,
        ]);

        SiteSetting::set('social_auto_special_enabled', '1');
        SiteSetting::set('social_auto_special_channel_ids', json_encode([$this->facebook->id]));
        SiteSetting::bust();
    }

    private function special(array $itemAttrs = [], array $specialAttrs = []): DailySpecial
    {
        $item = Item::factory()->create(array_merge(['base_price' => 50, 'name' => 'Masroshi'], $itemAttrs));

        return DailySpecial::create(array_merge([
            'item_id' => $item->id,
            'badge_label' => 'Today only',
            'special_price' => 40,
            'start_date' => now()->subDay()->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
            'is_active' => true,
        ], $specialAttrs));
    }

    public function test_approval_mode_drafts_a_post_instead_of_publishing(): void
    {
        Http::fake();
        $special = $this->special();

        $post = app(DailySpecialAutoPoster::class)->run();

        $this->assertNotNull($post);
        $this->assertSame(SocialPost::STATUS_AWAITING_APPROVAL, $post->status);
        $this->assertSame('special:' . $special->id, $post->source_ref);
        $this->assertSame(SocialPostDelivery::STATUS_SCHEDULED, SocialPostDelivery::firstOrFail()->status);
        Http::assertNothingSent(); // approval mode: nothing reaches a platform
    }

    public function test_one_automation_post_per_day_even_across_reruns(): void
    {
        $this->special();
        $poster = app(DailySpecialAutoPoster::class);

        $first = $poster->run();
        $second = $poster->run();

        $this->assertNotNull($first);
        $this->assertNull($second, 'a scheduler restart must not draft a second post');
        $this->assertSame(1, SocialPost::count());
    }

    public function test_approving_publishes_the_draft(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['post_id' => 'p1'], 200)]);
        $this->special();
        $post = app(DailySpecialAutoPoster::class)->run();

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->postJson("/api/admin/social/posts/{$post->id}/publish")->assertOk();

        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, SocialPostDelivery::firstOrFail()->status);
        $this->assertSame(SocialPost::STATUS_PUBLISHED, $post->fresh()->status);
    }

    public function test_unattended_mode_publishes_without_a_human(): void
    {
        Http::fake(['graph.facebook.com/*' => Http::response(['post_id' => 'p1'], 200)]);
        SiteSetting::set('social_auto_special_unattended', '1');
        SiteSetting::bust();
        $this->special();

        app(DailySpecialAutoPoster::class)->run();

        $this->assertSame(SocialPostDelivery::STATUS_PUBLISHED, SocialPostDelivery::firstOrFail()->status);
    }

    public function test_photo_required_channels_are_skipped_without_a_real_photo(): void
    {
        $instagram = SocialChannel::create([
            'platform' => 'instagram',
            'name' => 'IG',
            'credentials' => ['ig_user_id' => '9', 'access_token' => 't'],
            'is_enabled' => true,
            'is_test_channel' => true,
        ]);
        SiteSetting::set('social_auto_special_channel_ids', json_encode([$this->facebook->id, $instagram->id]));
        SiteSetting::bust();
        $this->special(); // factory items have no photos → site fallback only

        $post = app(DailySpecialAutoPoster::class)->run();

        $this->assertNotNull($post);
        $this->assertNull($post->snapshot['image_url'], 'no placeholder images in automated posts');
        $channelIds = SocialPostDelivery::pluck('social_channel_id');
        $this->assertTrue($channelIds->contains($this->facebook->id));
        $this->assertFalse($channelIds->contains($instagram->id), 'Instagram must be skipped without a real photo');
    }

    public function test_nothing_posts_when_no_special_is_active(): void
    {
        $this->special([], ['is_active' => false]);

        $this->assertNull(app(DailySpecialAutoPoster::class)->run());
        $this->assertSame(0, SocialPost::count());
    }

    public function test_stale_draft_is_skipped_when_the_special_ends_before_approval(): void
    {
        Http::fake();
        $special = $this->special();
        $post = app(DailySpecialAutoPoster::class)->run();

        // The special is switched off after drafting, before approval.
        $special->update(['is_active' => false]);

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->postJson("/api/admin/social/posts/{$post->id}/publish")->assertOk();

        $delivery = SocialPostDelivery::firstOrFail();
        $this->assertSame(SocialPostDelivery::STATUS_SKIPPED, $delivery->status);
        $this->assertStringContainsString('special has ended', (string) $delivery->error_message);
        Http::assertNothingSent();
    }

    public function test_stale_draft_is_skipped_when_the_price_moves(): void
    {
        Http::fake();
        $special = $this->special();
        $post = app(DailySpecialAutoPoster::class)->run();

        // Snapshot froze the 40.00 special price; the owner then edits it
        // (the admin controller busts the specials cache on every edit).
        $special->update(['special_price' => 35]);
        app(\App\Services\SpecialPricingService::class)->bustCache();

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->postJson("/api/admin/social/posts/{$post->id}/publish")->assertOk();

        $delivery = SocialPostDelivery::firstOrFail();
        $this->assertSame(SocialPostDelivery::STATUS_SKIPPED, $delivery->status);
        $this->assertStringContainsString('Price changed', (string) $delivery->error_message);
        Http::assertNothingSent();
    }

    public function test_caption_template_renders_variables(): void
    {
        SiteSetting::set('social_auto_special_template', '{item} for MVR {price} — {badge} {link}');
        SiteSetting::bust();
        $special = $this->special();

        $post = app(DailySpecialAutoPoster::class)->run();

        $this->assertSame(
            sprintf('Masroshi for MVR 40.00 — Today only %s', url('/menu/' . $special->item_id)),
            $post->snapshot['caption'],
        );
    }

    public function test_automation_settings_endpoint_round_trips(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->putJson('/api/admin/social/automation', [
            'enabled' => true,
            'time' => '10:30',
            'channel_ids' => [$this->facebook->id],
            'template' => 'X {item}',
            'unattended' => false,
        ])->assertOk();

        $res = $this->getJson('/api/admin/social/automation')->assertOk();
        $this->assertSame('10:30', $res->json('automation.time'));
        $this->assertFalse($res->json('automation.unattended'));
        $this->assertSame([$this->facebook->id], $res->json('automation.channel_ids'));
    }
}
