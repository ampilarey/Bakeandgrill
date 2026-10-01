<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Media\Jobs\ConvertUploadedVideo;
use App\Domains\Media\Services\MediaEditor;
use App\Domains\Media\Services\MediaLibraryService;
use App\Domains\Media\Services\MediaReferenceIndex;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Http\Middleware\RejectOversizedUploads;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Models\Media;
use App\Models\MediaAssetVersion;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Helpers\ModelHelpers;
use Tests\TestCase;

/**
 * Media audit fixes, 2026-10-01.
 */
class MediaAuditFixesTest extends TestCase
{
    use ModelHelpers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        PermissionCatalogSync::sync();
    }

    private function oldFile(string $path, int $days = 30): void
    {
        Storage::disk('public')->put($path, 'x');
        touch(Storage::disk('public')->path($path), now()->subDays($days)->getTimestamp());
    }

    public function test_prune_keeps_a_picture_used_by_a_hero_slide_the_library_or_a_tv_slide(): void
    {
        $this->oldFile('item-photos/7/hero.jpg');
        $this->oldFile('menu/library-only.jpg');
        $this->oldFile('site/orphan.jpg');
        $this->oldFile('menu/orphan.jpg');
        $this->oldFile('library/versions/3/old.jpg');

        SiteSetting::set('hero_slides', json_encode([['image' => 'https://bakeandgrill.mv/storage/item-photos/7/hero.jpg']]));
        Media::create(['disk' => 'public', 'path' => 'menu/library-only.jpg', 'media_type' => 'image', 'mime_type' => 'image/jpeg', 'source' => 'library']);
        $owner = Media::create(['disk' => 'public', 'path' => 'library/images/owner.jpg', 'media_type' => 'image', 'mime_type' => 'image/jpeg', 'source' => 'library']);
        MediaAssetVersion::create(['media_asset_id' => $owner->id, 'path' => 'library/versions/3/old.jpg', 'mime_type' => 'image/jpeg', 'file_size' => 1, 'created_at' => now()]);

        Artisan::call('media:prune-unreferenced', ['--days' => 7]);

        $this->assertTrue(Storage::disk('public')->exists('item-photos/7/hero.jpg'), 'hero slide keeps it');
        $this->assertTrue(Storage::disk('public')->exists('menu/library-only.jpg'), 'the library keeps it');
        $this->assertTrue(Storage::disk('public')->exists('library/versions/3/old.jpg'), 'an edit version keeps it');
        $this->assertFalse(Storage::disk('public')->exists('site/orphan.jpg'), 'site/ is covered now');
        $this->assertFalse(Storage::disk('public')->exists('menu/orphan.jpg'));
    }

    public function test_prune_removes_the_library_row_with_the_file_and_leaves_unknown_folders_alone(): void
    {
        $this->oldFile('menu/stale.jpg');
        $this->oldFile('somebody-elses-folder/file.bin');
        $row = Media::create(['disk' => 'public', 'path' => 'menu/stale.jpg', 'media_type' => 'image', 'mime_type' => 'image/jpeg', 'source' => 'library']);
        // Nothing references the row itself... except its own path, which is
        // what kept files alive before. A library row alone is a reference.
        $this->assertTrue(Storage::disk('public')->exists('menu/stale.jpg'));

        Artisan::call('media:prune-unreferenced', ['--days' => 7]);
        $this->assertTrue(Storage::disk('public')->exists('menu/stale.jpg'), 'a library row is a reference');
        $this->assertTrue(Storage::disk('public')->exists('somebody-elses-folder/file.bin'));
        $this->assertStringContainsString('somebody-elses-folder', Artisan::output());

        $row->delete();
        Artisan::call('media:prune-unreferenced', ['--days' => 7]);
        $this->assertFalse(Storage::disk('public')->exists('menu/stale.jpg'));
    }

    public function test_prune_expires_old_delivery_proofs(): void
    {
        Storage::disk('public')->put('delivery-proofs/2026/06/old.jpg', 'x');
        Storage::disk('public')->put('delivery-proofs/2026/09/recent.jpg', 'x');
        $old = $this->makePaidOrder(null, ['type' => 'delivery', 'status' => 'completed', 'delivered_at' => now()->subDays(120), 'proof_of_delivery_path' => 'delivery-proofs/2026/06/old.jpg']);
        $recent = $this->makePaidOrder(null, ['type' => 'delivery', 'status' => 'completed', 'delivered_at' => now()->subDays(5), 'proof_of_delivery_path' => 'delivery-proofs/2026/09/recent.jpg']);

        Artisan::call('media:prune-unreferenced', ['--days' => 7]);

        $this->assertNull($old->fresh()->proof_of_delivery_path);
        $this->assertFalse(Storage::disk('public')->exists('delivery-proofs/2026/06/old.jpg'));
        $this->assertSame('delivery-proofs/2026/09/recent.jpg', $recent->fresh()->proof_of_delivery_path);
        $this->assertTrue(Storage::disk('public')->exists('delivery-proofs/2026/09/recent.jpg'));
    }

    public function test_the_reference_index_reads_every_shape_of_url(): void
    {
        $this->assertSame('menu/a.jpg', MediaReferenceIndex::normalise('/storage/menu/a.jpg'));
        $this->assertSame('menu/a.jpg', MediaReferenceIndex::normalise('https://bakeandgrill.mv/storage/menu/a.jpg?v=3'));
        $this->assertSame('kitchen-production/4/x.jpg', MediaReferenceIndex::normalise('kitchen-production/4/x.jpg'));
        $this->assertNull(MediaReferenceIndex::normalise('https://cdn.example.com/x.jpg'));
        $this->assertNull(MediaReferenceIndex::normalise('/images/cafe/x.png'));
        $this->assertSame(['site/hero.jpg', 'menu/b.jpg'], MediaReferenceIndex::storagePathsIn('{"a":"\\/storage\\/site\\/hero.jpg","b":"https://x.mv/storage/menu/b.jpg"}'));
    }

    public function test_reconcile_drops_rows_whose_file_is_gone_but_not_fresh_uploads(): void
    {
        $gone = Media::create(['disk' => 'public', 'path' => 'library/images/gone.jpg', 'media_type' => 'image', 'mime_type' => 'image/jpeg', 'source' => 'library']);
        Media::query()->whereKey($gone->id)->update(['created_at' => now()->subDays(2)]);
        $fresh = Media::create(['disk' => 'public', 'path' => 'library/images/uploading.jpg', 'media_type' => 'image', 'mime_type' => 'image/jpeg', 'source' => 'library']);
        Storage::disk('public')->put('library/images/here.jpg', 'x');
        $here = Media::create(['disk' => 'public', 'path' => 'library/images/here.jpg', 'media_type' => 'image', 'mime_type' => 'image/jpeg', 'source' => 'library']);
        Media::query()->whereKey($here->id)->update(['created_at' => now()->subDays(2)]);

        $result = app(MediaLibraryService::class)->reconcile();

        $this->assertSame(1, $result['removed']);
        $this->assertNull(Media::find($gone->id));
        $this->assertNotNull(Media::find($fresh->id), 'an upload still writing its file is left alone');
        $this->assertNotNull(Media::find($here->id));
    }

    public function test_only_the_newest_versions_are_kept(): void
    {
        config(['media.max_versions' => 2]);
        $jpeg = UploadedFile::fake()->image('p.jpg', 400, 300);
        Storage::disk('public')->put('library/images/p.jpg', file_get_contents($jpeg->getRealPath()));
        $asset = Media::create(['disk' => 'public', 'path' => 'library/images/p.jpg', 'media_type' => 'image', 'mime_type' => 'image/jpeg', 'source' => 'library', 'width' => 400, 'height' => 300]);

        $editor = app(MediaEditor::class);
        for ($i = 0; $i < 4; $i++) {
            $editor->edit($asset->fresh(), 'rotate', ['degrees' => 90], 'replace');
        }

        $this->assertSame(2, MediaAssetVersion::where('media_asset_id', $asset->id)->count());
        $this->assertCount(2, Storage::disk('public')->allFiles('library/versions/' . $asset->id));
    }

    public function test_the_library_list_does_not_work_out_usage_per_tile_but_answers_on_demand(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        Storage::disk('public')->put('library/images/a.jpg', 'x');
        $a = Media::create(['disk' => 'public', 'path' => 'library/images/a.jpg', 'media_type' => 'image', 'mime_type' => 'image/jpeg', 'source' => 'library']);
        Item::factory()->create(['image_url' => '/storage/library/images/a.jpg']);

        $this->getJson('/api/admin/media')->assertOk()->assertJsonPath('data.0.usage_count', null);
        $this->getJson('/api/admin/media?with_usage=1')->assertOk()->assertJsonPath('data.0.usage_count', 1);
        $this->getJson('/api/admin/media/usage-counts?ids[]=' . $a->id)->assertOk()->assertJsonPath('counts.' . $a->id, 1);
    }

    public function test_an_upload_php_dropped_gets_a_clear_answer(): void
    {
        $this->assertSame(64 * 1048576, RejectOversizedUploads::bytes('64M'));
        $this->assertSame(2 * 1073741824, RejectOversizedUploads::bytes('2G'));

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $limit = RejectOversizedUploads::bytes((string) ini_get('post_max_size'));
        if ($limit <= 0) {
            $this->markTestSkipped('post_max_size is unlimited here');
        }

        $this->call('POST', '/api/admin/media', [], [], [], [
            'CONTENT_LENGTH' => $limit + 1,
            'CONTENT_TYPE' => 'multipart/form-data; boundary=x',
            'HTTP_ACCEPT' => 'application/json',
        ])->assertStatus(413)->assertJsonFragment(['message' => sprintf('That upload is bigger than this server allows (%d MB). Use a smaller file.', round($limit / 1048576))]);
    }

    public function test_uploads_are_told_to_be_cached_for_a_year(): void
    {
        $rules = (string) file_get_contents(base_path('storage/app/public/.htaccess'));
        $this->assertStringContainsString('max-age=31536000, immutable', $rules);
        $this->assertStringContainsString('upload_max_filesize', (string) file_get_contents(public_path('.user.ini')));
    }

    public function test_a_clip_is_saved_first_and_converted_after_and_customers_wait_for_it(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        config(['media.ffmpeg_disabled' => true]);
        $item = Item::factory()->create();

        // Without ffmpeg an mp4 is trusted at once...
        $photo = $this->post("/api/items/{$item->id}/photos", [
            'media_type' => 'video',
            'video' => UploadedFile::fake()->create('clip.mp4', 200, 'video/mp4'),
            'poster' => UploadedFile::fake()->image('poster.jpg', 800, 600),
        ], ['Accept' => 'application/json'])->assertCreated()->json('photo');
        $this->assertNull($photo['processing_status']);

        // ...and a .mov is refused now, not left converting for ever.
        $this->post("/api/items/{$item->id}/photos", [
            'media_type' => 'video',
            'video' => UploadedFile::fake()->create('clip.mov', 200, 'video/quicktime'),
            'poster' => UploadedFile::fake()->image('poster.jpg', 800, 600),
        ], ['Accept' => 'application/json'])->assertStatus(422);

        // A clip still converting is on the staff list and off the customer one.
        $converting = ItemPhoto::create([
            'item_id' => $item->id, 'url' => '/storage/item-photos/x/video/c.mov', 'media_type' => 'video',
            'sort_order' => 9, 'processing_status' => ConvertUploadedVideo::PROCESSING,
        ]);
        $this->assertSame(2, $item->allPhotos()->count());
        $this->assertSame(1, $item->photos()->count());
        $this->getJson("/api/items/{$item->id}/photos")->assertOk()->assertJsonCount(2, 'photos');

        // The job records a failure instead of leaving the row "processing".
        (new ConvertUploadedVideo('item_photo', (int) $converting->id))->handle(app(\App\Domains\Media\Services\VideoProcessor::class));
        $this->assertSame(ConvertUploadedVideo::FAILED, $converting->fresh()->processing_status);
        $this->assertStringContainsString('missing', (string) $converting->fresh()->processing_error);
    }
}
