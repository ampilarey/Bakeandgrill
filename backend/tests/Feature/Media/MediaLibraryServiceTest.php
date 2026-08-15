<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Media\Services\MediaLibraryService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Media;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MediaLibraryServiceTest extends TestCase
{
    use RefreshDatabase;

    private MediaLibraryService $library;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        $this->library = app(MediaLibraryService::class);
    }

    public function test_reconcile_catalogs_files_idempotently(): void
    {
        Storage::disk('public')->put('menu/burger.jpg', $this->tinyJpeg());
        Storage::disk('public')->put('thumbs/burger.jpg', $this->tinyJpeg()); // derived — skip as primary

        $first = $this->library->reconcile();
        $this->assertGreaterThanOrEqual(1, $first['created']);
        $this->assertSame(1, Media::where('path', 'menu/burger.jpg')->count());
        $this->assertSame(0, Media::where('path', 'thumbs/burger.jpg')->count());

        $second = $this->library->reconcile();
        $this->assertSame(0, $second['created']);
        $this->assertSame(1, Media::count());
    }

    public function test_checksum_dedupe_returns_existing(): void
    {
        $bytes = $this->tinyJpeg();
        Storage::disk('public')->put('library/images/orig.jpg', $bytes);
        $first = $this->library->registerPath('library/images/orig.jpg', 'library');
        $this->assertNotNull($first);
        $this->assertNotNull($first->checksum);

        Storage::disk('public')->put('library/images/copy.jpg', $bytes);
        $second = $this->library->registerPath('library/images/copy.jpg', 'library');
        $this->assertNotNull($second);
        $this->assertSame($first->id, $second->id);
        $this->assertSame(1, Media::count());
    }

    public function test_reconcile_sets_thumb_url_for_images(): void
    {
        Storage::disk('public')->put('menu/burger.jpg', $this->tinyJpeg());
        Storage::disk('public')->put('menu/thumbs/burger.jpg', $this->tinyJpeg());

        $this->library->reconcile();
        $row = Media::where('path', 'menu/burger.jpg')->first();
        $this->assertNotNull($row);
        $this->assertNotNull($row->thumb_url);
        $this->assertSame('/storage/menu/thumbs/burger.jpg', $row->thumb_url);
        $this->assertSame('/storage/menu/burger.jpg', $row->url);
    }

    public function test_backfill_missing_thumbs_fills_null_image_rows(): void
    {
        Storage::disk('public')->put('menu/plain.jpg', $this->tinyJpeg());
        $row = Media::create([
            'disk' => 'public',
            'path' => 'menu/plain.jpg',
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => 10,
            'thumb_url' => null,
            'source' => 'other',
        ]);
        Media::create([
            'disk' => 'public',
            'path' => 'library/video/a.mp4',
            'media_type' => 'video',
            'mime_type' => 'video/mp4',
            'file_size' => 10,
            'thumb_url' => null,
            'source' => 'library',
        ]);

        $fixed = $this->library->backfillMissingThumbs();
        $this->assertSame(1, $fixed);
        $row->refresh();
        $this->assertSame('/storage/menu/plain.jpg', $row->thumb_url);
        $this->assertNull(Media::where('media_type', 'video')->value('thumb_url'));
    }

    public function test_media_type_inferred_by_mime(): void
    {
        $this->assertSame('image', $this->library->mediaTypeFromMime('image/jpeg'));
        $this->assertSame('video', $this->library->mediaTypeFromMime('video/mp4'));
        $this->assertSame('video', $this->library->mediaTypeFromMime('video/quicktime'));
        $this->assertSame('audio', $this->library->mediaTypeFromMime('audio/mpeg'));
        $this->assertSame('document', $this->library->mediaTypeFromMime('application/pdf'));
        $this->assertNull($this->library->mediaTypeFromMime('text/plain'));
    }

    public function test_derived_files_not_primary(): void
    {
        $this->assertTrue($this->library->isDerivedPath('menu/thumbs/x.jpg'));
        $this->assertTrue($this->library->isDerivedPath('thumbs/x.jpg'));
        $this->assertTrue($this->library->isDerivedPath('menu-masters/x.jpg'));
        $this->assertTrue($this->library->isDerivedPath('library/versions/12/a.jpg'));
        $this->assertTrue($this->library->isDerivedPath('library/images/foo.webp'));
        $this->assertFalse($this->library->isDerivedPath('menu/x.jpg'));
    }

    public function test_purge_disk_files_removes_all_owned_paths(): void
    {
        Storage::disk('public')->put('library/images/a.jpg', 'a');
        Storage::disk('public')->put('library/images/a.webp', 'w');
        Storage::disk('public')->put('library/images/thumbs/a.jpg', 't');
        Storage::disk('public')->put('library/images/masters/a.jpg', 'm');

        $media = Media::create([
            'disk' => 'public',
            'path' => 'library/images/a.jpg',
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => 1,
            'source' => 'library',
            'thumb_url' => '/storage/library/images/thumbs/a.jpg',
            'original_url' => '/storage/library/images/masters/a.jpg',
            'image_webp_url' => '/storage/library/images/a.webp',
        ]);
        Storage::disk('public')->put('library/versions/' . $media->id . '/v1.jpg', 'v');

        $this->library->purgeDiskFiles($media);

        $this->assertFalse(Storage::disk('public')->exists('library/images/a.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('library/images/a.webp'));
        $this->assertFalse(Storage::disk('public')->exists('library/images/thumbs/a.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('library/images/masters/a.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('library/versions/' . $media->id . '/v1.jpg'));
    }

    private function tinyJpeg(): string
    {
        $img = imagecreatetruecolor(10, 10);
        ob_start();
        imagejpeg($img, null, 80);
        imagedestroy($img);

        return (string) ob_get_clean();
    }

    private function jpegUpload(string $name): UploadedFile
    {
        return UploadedFile::fake()->image($name, 200, 150);
    }
}
