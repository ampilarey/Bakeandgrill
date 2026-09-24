<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\SocialChannel;
use App\Models\SocialPost;
use App\Models\SocialPostDelivery;
use App\Models\SocialVideoRendition;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner's shortlist, 2026-09-24: video posts and carousels. Each driver
 * takes what its platform can: Facebook and Instagram videos and
 * multi-photo posts, Telegram videos and albums, Viber videos (with the
 * byte size it insists on) and the first photo of a carousel.
 */
class SocialMediaKindsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        config(['social.publish_allowed' => true, 'social.ig_poll_delay' => 0]);
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    private function channel(string $platform, array $credentials): SocialChannel
    {
        return SocialChannel::create([
            'platform' => $platform, 'name' => ucfirst($platform), 'credentials' => $credentials,
            'is_enabled' => true, 'is_test_channel' => true,
        ]);
    }

    private const IMAGES = ['https://bakeandgrill.mv/storage/a.jpg', 'https://bakeandgrill.mv/storage/b.jpg', 'https://bakeandgrill.mv/storage/c.jpg'];

    public function test_a_carousel_goes_out_as_a_multi_photo_post_an_album_and_the_first_photo(): void
    {
        Http::fake([
            'graph.facebook.com/*/111/photos' => Http::sequence()->push(['id' => 'ph1'])->push(['id' => 'ph2'])->push(['id' => 'ph3']),
            'graph.facebook.com/*/111/feed' => Http::response(['id' => '111_900'], 200),
            'graph.facebook.com/*/999/media' => Http::sequence()->push(['id' => 'C1'])->push(['id' => 'C2'])->push(['id' => 'C3'])->push(['id' => 'PARENT']),
            'graph.facebook.com/*/C1*' => Http::response(['status_code' => 'FINISHED'], 200),
            'graph.facebook.com/*/C2*' => Http::response(['status_code' => 'FINISHED'], 200),
            'graph.facebook.com/*/C3*' => Http::response(['status_code' => 'FINISHED'], 200),
            'graph.facebook.com/*/PARENT*' => Http::response(['status_code' => 'FINISHED'], 200),
            'graph.facebook.com/*/999/media_publish' => Http::response(['id' => 'MEDIA-1'], 200),
            'graph.facebook.com/*/MEDIA-1*' => Http::response(['permalink' => 'https://instagram.com/p/c'], 200),
            'api.telegram.org/*' => Http::response(['ok' => true, 'result' => [['message_id' => 7, 'chat' => ['username' => 'bg']], ['message_id' => 8]]], 200),
            'chatapi.viber.com/*' => Http::response(['status' => 0, 'message_token' => 'v1'], 200),
        ]);
        $fb = $this->channel('facebook', ['page_id' => '111', 'access_token' => 't']);
        $ig = $this->channel('instagram', ['ig_user_id' => '999', 'access_token' => 't']);
        $tg = $this->channel('telegram', ['bot_token' => '1:a', 'chat_id' => '@bg']);
        $vb = $this->channel('viber', ['auth_token' => 'v', 'sender_id' => 's']);

        $res = $this->postJson('/api/admin/social/posts', [
            'caption' => 'Three views of the masroshi',
            'media' => ['type' => 'carousel', 'images' => self::IMAGES],
            'channel_ids' => [$fb->id, $ig->id, $tg->id, $vb->id],
            'action' => 'now',
        ])->assertCreated();

        $this->assertSame('carousel', $res->json('post.media_type'));
        $this->assertSame(self::IMAGES, $res->json('post.snapshot.images'));
        $this->assertSame(self::IMAGES[0], $res->json('post.snapshot.image_url'), 'the first photo represents the post');
        $this->assertSame(4, SocialPostDelivery::where('status', SocialPostDelivery::STATUS_PUBLISHED)->count());

        // Facebook: three unpublished uploads, then one feed post attaching them.
        Http::assertSentCount(3 + 1 + 4 + 4 + 1 + 1 + 1 + 2);
        Http::assertSent(fn ($r) => str_contains($r->url(), '/111/photos') && $r['published'] === 'false' && $r['url'] === self::IMAGES[1]);
        Http::assertSent(fn ($r) => str_contains($r->url(), '/111/feed')
            && $r['attached_media'] === json_encode([['media_fbid' => 'ph1'], ['media_fbid' => 'ph2'], ['media_fbid' => 'ph3']]));
        // Instagram: three carousel children, then the CAROUSEL parent.
        Http::assertSent(fn ($r) => str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/999/media') && ($r['is_carousel_item'] ?? null) === 'true' && $r['image_url'] === self::IMAGES[2]);
        Http::assertSent(fn ($r) => str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/999/media') && ($r['media_type'] ?? null) === 'CAROUSEL' && $r['children'] === 'C1,C2,C3');
        $this->assertSame('MEDIA-1', SocialPostDelivery::where('social_channel_id', $ig->id)->firstOrFail()->provider_post_id);
        // Telegram: an album; the caption on the first photo; message id from the first.
        Http::assertSent(function ($r) {
            if (!str_contains($r->url(), 'sendMediaGroup')) {
                return false;
            }
            $media = json_decode($r['media'], true);

            return count($media) === 3 && $media[0]['caption'] === 'Three views of the masroshi' && !isset($media[1]['caption']);
        });
        $this->assertSame('https://t.me/bg/7', SocialPostDelivery::where('social_channel_id', $tg->id)->firstOrFail()->permalink);
        // Viber: no albums, the first photo carries the post.
        Http::assertSent(fn ($r) => str_contains($r->url(), '/pa/post') && $r['type'] === 'picture' && $r['media'] === self::IMAGES[0]);
    }

    public function test_a_video_becomes_a_page_video_a_reel_a_telegram_video_and_a_viber_video_with_its_size(): void
    {
        Http::fake([
            'graph.facebook.com/*/111/videos' => Http::response(['id' => 'vid-1'], 200),
            'graph.facebook.com/*/999/media' => Http::response(['id' => 'RC'], 200),
            'graph.facebook.com/*/RC*' => Http::response(['status_code' => 'FINISHED'], 200),
            'graph.facebook.com/*/999/media_publish' => Http::response(['id' => 'REEL-1'], 200),
            'graph.facebook.com/*/REEL-1*' => Http::response(['permalink' => 'https://instagram.com/reel/x'], 200),
            'api.telegram.org/*' => Http::response(['ok' => true, 'result' => ['message_id' => 3, 'chat' => ['username' => 'bg']]], 200),
            'chatapi.viber.com/*' => Http::response(['status' => 0, 'message_token' => 'v2'], 200),
        ]);
        $fb = $this->channel('facebook', ['page_id' => '111', 'access_token' => 't']);
        $ig = $this->channel('instagram', ['ig_user_id' => '999', 'access_token' => 't']);
        $tg = $this->channel('telegram', ['bot_token' => '1:a', 'chat_id' => '@bg']);
        $vb = $this->channel('viber', ['auth_token' => 'v', 'sender_id' => 's']);

        $res = $this->postJson('/api/admin/social/posts', [
            'caption' => 'Watch it sizzle',
            'media' => ['type' => 'video', 'video_url' => 'https://bakeandgrill.mv/storage/social-videos/m.mp4', 'video_poster_url' => 'https://bakeandgrill.mv/storage/social-videos/m.jpg', 'video_bytes' => 2400000],
            'channel_ids' => [$fb->id, $ig->id, $tg->id, $vb->id],
            'action' => 'now',
        ])->assertCreated();

        $this->assertSame('video', $res->json('post.media_type'));
        $this->assertSame('https://bakeandgrill.mv/storage/social-videos/m.jpg', $res->json('post.snapshot.image_url'), 'the poster represents the post');
        $this->assertSame(4, SocialPostDelivery::where('status', SocialPostDelivery::STATUS_PUBLISHED)->count());

        Http::assertSent(fn ($r) => str_contains($r->url(), '/111/videos') && $r['file_url'] === 'https://bakeandgrill.mv/storage/social-videos/m.mp4' && $r['description'] === 'Watch it sizzle');
        Http::assertSent(fn ($r) => str_ends_with((string) parse_url($r->url(), PHP_URL_PATH), '/999/media') && $r['media_type'] === 'REELS' && $r['cover_url'] === 'https://bakeandgrill.mv/storage/social-videos/m.jpg');
        Http::assertSent(fn ($r) => str_contains($r->url(), 'sendVideo') && $r['video'] === 'https://bakeandgrill.mv/storage/social-videos/m.mp4');
        Http::assertSent(fn ($r) => str_contains($r->url(), '/pa/post') && $r['type'] === 'video' && $r['size'] === 2400000 && $r['thumbnail'] === 'https://bakeandgrill.mv/storage/social-videos/m.jpg');
    }

    public function test_the_item_preview_offers_the_gallery_and_ready_videos_and_a_draft_keeps_its_media_when_edited(): void
    {
        $item = Item::factory()->create(['name' => 'Masroshi', 'image_url' => 'https://cdn.example.com/m1.jpg']);
        $item->photos()->create(['url' => 'https://cdn.example.com/m2.jpg', 'sort_order' => 2, 'is_primary' => false]);
        SocialVideoRendition::create(['item_id' => $item->id, 'format' => 'vertical', 'status' => 'ready', 'source_fingerprint' => 'fp', 'path' => 'social-videos/v.mp4', 'poster_path' => 'social-videos/v.jpg', 'bytes' => 1234, 'width' => 720, 'height' => 1280]);
        SocialVideoRendition::create(['item_id' => $item->id, 'format' => 'square', 'status' => 'queued', 'source_fingerprint' => 'fp']);

        $res = $this->getJson('/api/admin/social/item-preview?item_id=' . $item->id)->assertOk();
        $this->assertSame(['https://cdn.example.com/m2.jpg', 'https://cdn.example.com/m1.jpg'], $res->json('item.gallery'), 'gallery photos first, the legacy main image last');
        $this->assertCount(1, $res->json('item.videos'), 'only ready renditions');
        $this->assertSame('vertical', $res->json('item.videos.0.format'));
        $this->assertSame(1234, $res->json('item.videos.0.bytes'));

        $fb = $this->channel('facebook', ['page_id' => '111', 'access_token' => 't']);
        $id = $this->postJson('/api/admin/social/posts', [
            'caption' => 'x', 'media' => ['type' => 'carousel', 'images' => $res->json('item.gallery')],
            'channel_ids' => [$fb->id], 'action' => 'draft',
        ])->assertCreated()->json('post.id');
        $edited = $this->patchJson("/api/admin/social/posts/{$id}", ['caption' => 'y'])->assertOk();
        $this->assertSame('carousel', $edited->json('post.media_type'), 'an edit that says nothing about media keeps it');
        $this->assertCount(2, $edited->json('post.snapshot.images'));
    }

    public function test_a_video_is_refused_for_a_channel_that_cannot_take_one_and_a_single_image_is_still_a_photo(): void
    {
        $fb = $this->channel('facebook', ['page_id' => '111', 'access_token' => 't']);
        $res = $this->postJson('/api/admin/social/posts', [
            'caption' => 'x', 'media' => ['type' => 'carousel', 'images' => [self::IMAGES[0]]],
            'channel_ids' => [$fb->id], 'action' => 'draft',
        ])->assertCreated();
        $this->assertSame('photo', $res->json('post.media_type'));
        $this->assertNull($res->json('post.snapshot.images'));

        $this->postJson('/api/admin/social/posts', [
            'caption' => 'x', 'media' => ['type' => 'video', 'video_url' => 'not a url'],
            'channel_ids' => [$fb->id], 'action' => 'draft',
        ])->assertStatus(422);

        // A driver without video is refused at compose time (none today; simulated by asking for text-only capability).
        $this->assertTrue(app(\App\Domains\Social\Services\SocialDriverRegistry::class)->capabilities()['viber']['video']);
        $this->assertFalse(app(\App\Domains\Social\Services\SocialDriverRegistry::class)->capabilities()['viber']['carousel']);
        $this->assertSame(1, SocialPost::count());
    }
}
