<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Social\Services\DailySpecialAutoPoster;
use App\Models\DailySpecial;
use App\Models\Item;
use App\Models\SiteSetting;
use App\Models\SocialChannel;
use App\Models\SocialPostDelivery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Social Hub audit, 2026-09-24: the composer. Picking an item shows what
 * will be frozen; a draft can be edited until it goes out; automation
 * drafts keep their item and channels.
 */
class SocialComposerTest extends TestCase
{
    use RefreshDatabase;

    private SocialChannel $facebook;

    private SocialChannel $telegram;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        config(['social.publish_allowed' => true]);
        $this->facebook = SocialChannel::create([
            'platform' => 'facebook', 'name' => 'Page',
            'credentials' => ['page_id' => '1', 'access_token' => 't'],
            'is_enabled' => true, 'is_test_channel' => true,
        ]);
        $this->telegram = SocialChannel::create([
            'platform' => 'telegram', 'name' => 'TG',
            'credentials' => ['bot_token' => '1:a', 'chat_id' => '@bg'],
            'is_enabled' => true, 'is_test_channel' => true,
        ]);
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    public function test_item_preview_gives_the_frozen_facts_and_no_logo_placeholder(): void
    {
        $plain = Item::factory()->create(['name' => 'Masroshi', 'name_dv' => 'މަސްރޮށި', 'base_price' => 12]);
        $res = $this->getJson('/api/admin/social/item-preview?item_id=' . $plain->id)->assertOk();
        $this->assertSame('Masroshi', $res->json('item.name'));
        $this->assertSame('މަސްރޮށި', $res->json('item.name_dv'));
        $this->assertSame(12.0, (float) $res->json('item.price'));
        $this->assertNull($res->json('item.image_url'), 'no real photo: no image, never the site logo');
        $this->assertSame(url('/menu/' . $plain->id), $res->json('item.link_url'));

        // An off-site JPEG is trusted as a real photo (SocialPreviewImage).
        $photographed = Item::factory()->create(['image_url' => 'https://cdn.example.com/kulhi.jpg']);
        $this->assertSame('https://cdn.example.com/kulhi.jpg', $this->getJson('/api/admin/social/item-preview?item_id=' . $photographed->id)->json('item.image_url'));

        $this->getJson('/api/admin/social/item-preview?item_id=999999')->assertStatus(422);
    }

    public function test_a_draft_can_be_edited_and_its_channels_changed(): void
    {
        $id = $this->postJson('/api/admin/social/posts', [
            'caption' => 'First words',
            'channel_ids' => [$this->facebook->id],
            'action' => 'draft',
        ])->assertCreated()->json('post.id');

        $res = $this->patchJson("/api/admin/social/posts/{$id}", [
            'caption' => 'Better words',
            'image_url' => 'https://bakeandgrill.mv/storage/m.jpg',
            'channel_ids' => [$this->telegram->id],
        ])->assertOk();

        $this->assertSame('Better words', $res->json('post.snapshot.caption'));
        $this->assertSame('https://bakeandgrill.mv/storage/m.jpg', $res->json('post.snapshot.image_url'));
        $this->assertSame([$this->telegram->id], collect($res->json('post.deliveries'))->pluck('channel.id')->all());
        $this->assertSame('draft', $res->json('post.status'));
    }

    public function test_editing_relinks_the_item_and_refreezes_the_price(): void
    {
        $item = Item::factory()->create(['name' => 'Kulhi Boakibaa', 'base_price' => 30]);
        $id = $this->postJson('/api/admin/social/posts', [
            'caption' => 'x', 'channel_ids' => [$this->facebook->id], 'action' => 'draft',
        ])->json('post.id');

        $item->update(['base_price' => 35]);
        $res = $this->patchJson("/api/admin/social/posts/{$id}", ['item_id' => $item->id])->assertOk();

        $this->assertSame(35.0, (float) $res->json('post.snapshot.price'));
        $this->assertSame(url('/menu/' . $item->id), $res->json('post.snapshot.link_url'));
    }

    public function test_a_draft_becomes_scheduled_and_back_and_needs_the_schedule_permission(): void
    {
        $id = $this->postJson('/api/admin/social/posts', [
            'caption' => 'x', 'channel_ids' => [$this->facebook->id], 'action' => 'draft',
        ])->json('post.id');

        $at = now()->addHours(2)->toIso8601String();
        $res = $this->patchJson("/api/admin/social/posts/{$id}", ['action' => 'schedule', 'scheduled_at' => $at])->assertOk();
        $this->assertSame('scheduled', $res->json('post.status'));
        $this->assertNotNull($res->json('post.scheduled_at'));

        $res = $this->patchJson("/api/admin/social/posts/{$id}", ['action' => 'draft'])->assertOk();
        $this->assertSame('draft', $res->json('post.status'));
        $this->assertNull($res->json('post.scheduled_at'));

        $this->patchJson("/api/admin/social/posts/{$id}", ['action' => 'schedule'])->assertStatus(422);

        // A composer without social.schedule cannot schedule by editing either.
        $staff = $this->makeStaff('cashier');
        $staff->permissions()->attach(
            \App\Models\Permission::where('slug', 'social.compose')->firstOrFail()->id,
            ['granted' => true],
        );
        $staff->permissions()->attach(
            \App\Models\Permission::where('slug', 'social.view')->firstOrFail()->id,
            ['granted' => true],
        );
        Sanctum::actingAs($staff, ['staff']);
        $this->patchJson("/api/admin/social/posts/{$id}", ['action' => 'schedule', 'scheduled_at' => $at])->assertStatus(403);
    }

    public function test_edits_respect_the_platform_limits_and_published_posts_are_locked(): void
    {
        $id = $this->postJson('/api/admin/social/posts', [
            'caption' => 'x', 'image_url' => 'https://bakeandgrill.mv/storage/m.jpg',
            'channel_ids' => [$this->telegram->id], 'action' => 'draft',
        ])->json('post.id');

        $this->patchJson("/api/admin/social/posts/{$id}", ['caption' => str_repeat('a', 1100)])->assertStatus(422);

        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true, 'result' => ['message_id' => 1]], 200)]);
        $this->postJson("/api/admin/social/posts/{$id}/publish")->assertOk();
        $this->patchJson("/api/admin/social/posts/{$id}", ['caption' => 'too late'])->assertStatus(422);
    }

    public function test_an_automation_draft_keeps_its_item_and_channels_but_takes_new_words(): void
    {
        SiteSetting::set('social_auto_special_enabled', '1');
        SiteSetting::set('social_auto_special_channel_ids', json_encode([$this->facebook->id]));
        SiteSetting::bust();
        $item = Item::factory()->create(['name' => 'Masroshi', 'base_price' => 50]);
        $special = DailySpecial::create([
            'item_id' => $item->id, 'badge_label' => 'Today', 'special_price' => 40,
            'start_date' => now()->subDay()->toDateString(), 'end_date' => now()->addDay()->toDateString(), 'is_active' => true,
        ]);
        $post = app(DailySpecialAutoPoster::class)->run();
        $other = Item::factory()->create();

        $res = $this->patchJson("/api/admin/social/posts/{$post->id}", [
            'caption' => 'Hand-written caption',
            'item_id' => $other->id,
            'channel_ids' => [$this->telegram->id],
            'action' => 'draft',
        ])->assertOk();

        $this->assertSame('Hand-written caption', $res->json('post.snapshot.caption'));
        $this->assertSame($item->id, $res->json('post.snapshot.item_id'), 'the automation item stays');
        $this->assertSame($special->id, $res->json('post.snapshot.special_id'), 'the stale check still knows the special');
        $this->assertSame(40.0, (float) $res->json('post.snapshot.price'));
        $this->assertSame('awaiting_approval', $res->json('post.status'), 'still awaiting approval');
        $this->assertSame([$this->facebook->id], SocialPostDelivery::where('social_post_id', $post->id)->pluck('social_channel_id')->all());
    }
}
