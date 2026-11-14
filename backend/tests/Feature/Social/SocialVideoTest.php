<?php

declare(strict_types=1);

namespace Tests\Feature\Social;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Social\Jobs\RenderSocialVideoJob;
use App\Domains\Social\Services\SocialVideoRenderer;
use App\Models\Item;
use App\Models\SocialVideoRendition;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Social video renditions (plan, video section). ffmpeg itself is not
 * exercised here — the TEST-host benchmark (social:video-benchmark) is the
 * hard gate for real rendering. These tests cover the API contract, the
 * real-photos-only rule, fingerprint invalidation, queue routing, and the
 * ffmpeg-unavailable refusal.
 */
class SocialVideoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    /** Point media.ffmpeg_path at stub scripts so available() passes without real ffmpeg. */
    private function fakeFfmpegAvailable(): void
    {
        $dir = storage_path('framework/testing/ffmpeg-stub');
        @mkdir($dir, 0775, true);
        foreach (['ffmpeg', 'ffprobe'] as $bin) {
            $path = "{$dir}/{$bin}";
            file_put_contents($path, "#!/bin/sh\necho '{$bin} version 6.0-stub'\nexit 0\n");
            chmod($path, 0755);
        }
        config(['media.ffmpeg_path' => "{$dir}/ffmpeg", 'media.ffprobe_path' => "{$dir}/ffprobe"]);
    }

    private function itemWithPhoto(): Item
    {
        Storage::fake('public');
        $item = Item::factory()->create(['base_price' => 50, 'name' => 'Masroshi']);
        Storage::disk('public')->put("item-photos/{$item->id}/a.jpg", 'jpeg-bytes');
        \Illuminate\Support\Facades\DB::table('item_photos')->insert([
            'item_id' => $item->id,
            'url' => '/storage/item-photos/' . $item->id . '/a.jpg',
            'sort_order' => 0,
            'is_primary' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $item;
    }

    public function test_generating_queues_a_render_on_the_social_queue(): void
    {
        Queue::fake();
        $this->fakeFfmpegAvailable();
        $item = $this->itemWithPhoto();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson("/api/admin/social/items/{$item->id}/videos", ['format' => 'vertical'])
            ->assertStatus(202);

        $rendition = SocialVideoRendition::firstOrFail();
        $this->assertSame(SocialVideoRendition::STATUS_QUEUED, $rendition->status);
        Queue::assertPushedOn('social', RenderSocialVideoJob::class);
    }

    public function test_rendering_refuses_without_ffmpeg(): void
    {
        config(['media.ffmpeg_disabled' => true]);
        $item = $this->itemWithPhoto();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->postJson("/api/admin/social/items/{$item->id}/videos", ['format' => 'vertical'])
            ->assertStatus(422);
        $this->assertSame(0, SocialVideoRendition::count());
    }

    public function test_items_without_real_photos_are_refused(): void
    {
        Queue::fake();
        $this->fakeFfmpegAvailable();
        Storage::fake('public');
        $item = Item::factory()->create(); // no photos at all
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $res = $this->postJson("/api/admin/social/items/{$item->id}/videos", ['format' => 'vertical'])
            ->assertStatus(422);
        $this->assertStringContainsString('real item photos', (string) $res->json('message'));
        Queue::assertNothingPushed();
    }

    public function test_fresh_ready_rendition_is_not_requeued_but_stale_one_is(): void
    {
        Queue::fake();
        $this->fakeFfmpegAvailable();
        $item = $this->itemWithPhoto();
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $fingerprint = app(SocialVideoRenderer::class)->fingerprint($item->fresh('photos'));
        $rendition = SocialVideoRendition::create([
            'item_id' => $item->id,
            'format' => 'vertical',
            'status' => SocialVideoRendition::STATUS_READY,
            'source_fingerprint' => $fingerprint,
            'path' => 'social-videos/x.mp4',
        ]);

        // Unchanged source: 200, no re-render.
        $this->postJson("/api/admin/social/items/{$item->id}/videos", ['format' => 'vertical'])
            ->assertOk();
        Queue::assertNothingPushed();

        // Price change → fingerprint moves → listing flags stale, POST re-queues.
        $item->update(['base_price' => 75]);
        $list = $this->getJson("/api/admin/social/items/{$item->id}/videos")->assertOk();
        $this->assertTrue($list->json('renditions.0.stale'));

        $this->postJson("/api/admin/social/items/{$item->id}/videos", ['format' => 'vertical'])
            ->assertStatus(202);
        Queue::assertPushedOn('social', RenderSocialVideoJob::class);
        $this->assertSame(1, SocialVideoRendition::count(), 'regeneration replaces in place, never duplicates');
        $this->assertSame(SocialVideoRendition::STATUS_QUEUED, $rendition->fresh()->status);
    }

    public function test_video_endpoints_require_permissions(): void
    {
        $item = $this->itemWithPhoto();

        Sanctum::actingAs($this->makeStaff('kitchen_staff'), ['staff']);
        $this->getJson("/api/admin/social/items/{$item->id}/videos")->assertStatus(403);
        $this->postJson("/api/admin/social/items/{$item->id}/videos", ['format' => 'vertical'])->assertStatus(403);
    }

    public function test_deleting_a_rendition_removes_its_files(): void
    {
        $this->fakeFfmpegAvailable();
        $item = $this->itemWithPhoto();
        Storage::disk('public')->put('social-videos/1/v.mp4', 'video');
        Storage::disk('public')->put('social-videos/1/v.jpg', 'poster');
        $rendition = SocialVideoRendition::create([
            'item_id' => $item->id,
            'format' => 'vertical',
            'status' => SocialVideoRendition::STATUS_READY,
            'source_fingerprint' => 'x',
            'path' => 'social-videos/1/v.mp4',
            'poster_path' => 'social-videos/1/v.jpg',
        ]);
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->deleteJson("/api/admin/social/videos/{$rendition->id}")->assertOk();

        Storage::disk('public')->assertMissing('social-videos/1/v.mp4');
        Storage::disk('public')->assertMissing('social-videos/1/v.jpg');
        $this->assertSame(0, SocialVideoRendition::count());
    }

    /** Owner, 2026-11-15: "Long time now video doesn't render": the queue's worker had gone, and the clip sat at "queued". */
    public function test_the_scheduler_renders_a_waiting_clip_without_a_worker_and_never_twice(): void
    {
        Queue::fake();
        $this->fakeFfmpegAvailable();
        $item = $this->itemWithPhoto();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->postJson("/api/admin/social/items/{$item->id}/videos", ['format' => 'vertical'])->assertStatus(202);
        $waiting = SocialVideoRendition::firstOrFail();

        // One left at "processing" by a run that was killed long ago.
        $stuck = $waiting->replicate();
        $stuck->format = 'square';
        $stuck->status = SocialVideoRendition::STATUS_PROCESSING;
        $stuck->save();
        SocialVideoRendition::query()->where('id', $stuck->id)->update(['updated_at' => now()->subHours(2)]);

        $rendered = [];
        $this->mock(SocialVideoRenderer::class, function ($mock) use (&$rendered): void {
            $mock->shouldReceive('render')->andReturnUsing(function (SocialVideoRendition $r) use (&$rendered): void {
                $rendered[] = $r->id;
                $r->forceFill(['status' => SocialVideoRendition::STATUS_READY])->save();
            });
        });

        $this->artisan('social:render-waiting')->assertSuccessful();
        $this->assertSame([$waiting->id], $rendered);
        $this->assertSame(SocialVideoRendition::STATUS_READY, $waiting->fresh()->status);
        $this->assertSame(SocialVideoRendition::STATUS_FAILED, $stuck->fresh()->status);
        $this->assertStringContainsString('Generate', (string) $stuck->fresh()->error_message);

        // The queued job arriving late, and a second run, find nothing to do.
        (new RenderSocialVideoJob($waiting->id))->handle(app(SocialVideoRenderer::class));
        $this->artisan('social:render-waiting')->assertSuccessful();
        $this->assertSame([$waiting->id], $rendered);

        // While one clip is rendering, the next waits its turn.
        $busy = $waiting->replicate();
        $busy->format = 'landscape';
        $busy->status = SocialVideoRendition::STATUS_PROCESSING;
        $busy->save();
        $next = $stuck->fresh();
        $next->forceFill(['status' => SocialVideoRendition::STATUS_QUEUED])->save();
        $this->artisan('social:render-waiting')->assertSuccessful();
        $this->assertSame(SocialVideoRendition::STATUS_QUEUED, $next->fresh()->status);
        $busy->delete();
        $this->artisan('social:render-waiting')->assertSuccessful();
        $this->assertSame(SocialVideoRendition::STATUS_READY, $next->fresh()->status);

        // A clip already claimed is left to whoever claimed it.
        $this->assertFalse(RenderSocialVideoJob::claim($waiting->id));
    }

    /** Owner, 2026-11-15: "when I click video, it doesn't show created videos. I have to select the item." */
    public function test_every_clip_made_is_listed_with_its_dish_without_picking_one(): void
    {
        Queue::fake();
        $this->fakeFfmpegAvailable();
        $item = $this->itemWithPhoto();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->getJson('/api/admin/social/videos')->assertOk()->assertJsonCount(0, 'data');

        $this->postJson("/api/admin/social/items/{$item->id}/videos", ['format' => 'vertical'])->assertStatus(202);
        $this->postJson("/api/admin/social/items/{$item->id}/videos", ['format' => 'square'])->assertStatus(202);

        $list = $this->getJson('/api/admin/social/videos')->assertOk()->assertJsonCount(2, 'data');
        $list->assertJsonPath('data.0.item_name', $item->name)->assertJsonPath('data.0.item_id', $item->id);
        $this->assertEqualsCanonicalizing(['vertical', 'square'], array_column($list->json('data'), 'format'));
    }
}
