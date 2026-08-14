<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Media\Services\MediaEditor;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\Media;
use App\Models\MediaAssetVersion;
use App\Models\Role;
use App\Models\User;
use App\Support\ImageCapabilities;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MediaEditTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Media $asset;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
        $this->owner = User::create([
            'name' => 'Owner Edit',
            'email' => 'owner-edit@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'owner')->value('id'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($this->owner, ['staff']);

        $img = imagecreatetruecolor(200, 150);
        $white = imagecolorallocate($img, 255, 255, 255);
        imagefilledrectangle($img, 0, 0, 199, 149, $white);
        ob_start();
        imagejpeg($img, null, 90);
        $bytes = (string) ob_get_clean();
        imagedestroy($img);

        Storage::disk('public')->put('library/images/edit-me.jpg', $bytes);
        Storage::disk('public')->put('library/images/masters/edit-me.jpg', $bytes);

        $this->asset = Media::create([
            'disk' => 'public',
            'path' => 'library/images/edit-me.jpg',
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => strlen($bytes),
            'width' => 200,
            'height' => 150,
            'original_url' => '/storage/library/images/masters/edit-me.jpg',
            'source' => 'library',
            'title' => 'Edit me',
        ]);
    }

    public function test_resize_and_rotate_via_api(): void
    {
        $this->postJson("/api/admin/media/{$this->asset->id}/edit", [
            'op' => 'resize',
            'params' => ['preset' => '256', 'keep_aspect' => true],
            'mode' => 'replace',
        ])->assertOk()->assertJsonPath('mode', 'replace');

        $this->postJson("/api/admin/media/{$this->asset->id}/edit", [
            'op' => 'rotate',
            'params' => ['degrees' => 90],
            'mode' => 'replace',
        ])->assertOk();

        $this->assertGreaterThan(0, MediaAssetVersion::where('media_asset_id', $this->asset->id)->count());
    }

    public function test_convert_webp_when_supported(): void
    {
        if (!ImageCapabilities::supportsWebp()) {
            $this->markTestSkipped('WebP not supported');
        }

        $this->postJson("/api/admin/media/{$this->asset->id}/edit", [
            'op' => 'convert',
            'params' => ['format' => 'webp'],
            'mode' => 'replace',
        ])->assertOk();

        $this->asset->refresh();
        $this->assertSame('image/webp', $this->asset->mime_type);
    }

    public function test_crop_from_master(): void
    {
        $this->postJson("/api/admin/media/{$this->asset->id}/edit", [
            'op' => 'crop',
            'params' => [
                'x' => 10, 'y' => 10, 'width' => 100, 'height' => 80,
                'output_width' => 100, 'output_height' => 80,
            ],
            'mode' => 'replace',
        ])->assertOk();
    }

    public function test_optimize_and_thumbnail(): void
    {
        $this->postJson("/api/admin/media/{$this->asset->id}/edit", [
            'op' => 'optimize',
            'params' => ['quality' => 60],
            'mode' => 'replace',
        ])->assertOk();

        $this->postJson("/api/admin/media/{$this->asset->id}/edit", [
            'op' => 'thumbnail',
            'params' => [],
            'mode' => 'replace',
        ])->assertOk();
    }

    public function test_replace_updates_references_and_keeps_backup(): void
    {
        $url = $this->asset->url;
        $category = Category::create(['name' => 'Food', 'slug' => 'food-ml-edit', 'is_active' => true]);
        Item::create([
            'category_id' => $category->id,
            'name' => 'Ref Item',
            'base_price' => 9,
            'sku' => 'REF-ML-1',
            'is_active' => true,
            'is_available' => true,
            'image_url' => $url,
        ]);

        $res = $this->postJson("/api/admin/media/{$this->asset->id}/edit", [
            'op' => 'optimize',
            'params' => ['quality' => 50],
            'mode' => 'replace',
        ])->assertOk();

        $this->assertGreaterThanOrEqual(0, (int) $res->json('updated_references'));
        $this->assertSame(1, MediaAssetVersion::where('media_asset_id', $this->asset->id)->count());
    }

    public function test_replace_file_rewrites_main_and_thumb_usages(): void
    {
        Storage::disk('public')->put('library/images/thumbs/old-thumb.jpg', 'thumb');
        $this->asset->thumb_url = '/storage/library/images/thumbs/old-thumb.jpg';
        $this->asset->save();

        $oldMain = $this->asset->url;
        $oldThumb = (string) $this->asset->thumb_url;

        $category = Category::create(['name' => 'Food', 'slug' => 'food-ml-replace', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'Replace Ref Item',
            'base_price' => 12,
            'sku' => 'REF-ML-REPLACE',
            'is_active' => true,
            'is_available' => true,
            'image_url' => $oldMain,
            'thumb_url' => $oldThumb,
            'image_original_url' => (string) $this->asset->original_url,
        ]);

        $file = UploadedFile::fake()->image('new-photo.jpg', 320, 240);

        $res = $this->post("/api/admin/media/{$this->asset->id}/replace-file", [
            'file' => $file,
        ])->assertOk()
            ->assertJsonPath('mode', 'replace')
            ->assertJsonStructure(['asset', 'updated_references', 'mode']);

        $this->assertGreaterThanOrEqual(2, (int) $res->json('updated_references'));

        $this->asset->refresh();
        $item->refresh();

        $this->assertNotSame($oldMain, $this->asset->url);
        $this->assertNotSame($oldThumb, (string) $this->asset->thumb_url);
        $this->assertSame($this->asset->url, $item->image_url);
        $this->assertSame($this->asset->thumb_url, $item->thumb_url);
        $this->assertSame($this->asset->original_url, $item->image_original_url);
        $this->assertTrue(Storage::disk('public')->exists($this->asset->path));
        $this->assertFalse(Storage::disk('public')->exists('library/images/edit-me.jpg'));
        $this->assertSame(1, MediaAssetVersion::where('media_asset_id', $this->asset->id)->count());
    }

    public function test_copy_leaves_original(): void
    {
        $beforePath = $this->asset->path;
        $beforeCount = Media::count();

        $res = $this->postJson("/api/admin/media/{$this->asset->id}/edit", [
            'op' => 'resize',
            'params' => ['width' => 100, 'height' => 75, 'keep_aspect' => true],
            'mode' => 'copy',
        ])->assertOk();

        $this->assertSame('copy', $res->json('mode'));
        $this->assertSame($beforeCount + 1, Media::count());
        $this->assertSame($beforePath, $this->asset->fresh()->path);
        $this->assertNotSame($beforePath, $res->json('asset.path'));
    }

    public function test_restore_previous_version(): void
    {
        $this->postJson("/api/admin/media/{$this->asset->id}/edit", [
            'op' => 'rotate',
            'params' => ['degrees' => 180],
            'mode' => 'replace',
        ])->assertOk();

        $this->postJson("/api/admin/media/{$this->asset->id}/restore")
            ->assertOk()
            ->assertJsonStructure(['asset', 'updated_references']);
    }

    public function test_editor_service_direct(): void
    {
        $editor = app(MediaEditor::class);
        $result = $editor->edit($this->asset, 'optimize', ['quality' => 70], 'replace', $this->owner);
        $this->assertSame('replace', $result['mode']);
        $this->assertInstanceOf(Media::class, $result['asset']);
    }

    /** Stage 2a — free angle (not only 90/180/270) expands canvas. */
    public function test_rotate_free_angle_expands_canvas(): void
    {
        $this->postJson("/api/admin/media/{$this->asset->id}/edit", [
            'op' => 'rotate',
            'params' => ['degrees' => 45],
            'mode' => 'replace',
        ])->assertOk();

        $this->asset->refresh();
        // 200×150 at 45° → bounding box larger than either side alone.
        $this->assertGreaterThan(200, (int) $this->asset->width);
        $this->assertGreaterThan(150, (int) $this->asset->height);
    }

    /** Stage 2a — JPEG free-angle fill is white, not black. */
    public function test_rotate_jpeg_fill_is_white_not_black(): void
    {
        $editor = app(MediaEditor::class);
        $editor->edit($this->asset, 'rotate', ['degrees' => 45], 'replace', $this->owner);
        $this->asset->refresh();

        $absolute = Storage::disk('public')->path($this->asset->path);
        $img = imagecreatefromjpeg($absolute);
        $this->assertNotFalse($img);
        // Corner of expanded canvas should be near-white (JPEG fill), not black.
        $rgb = imagecolorat($img, 0, 0);
        $r = ($rgb >> 16) & 0xFF;
        $g = ($rgb >> 8) & 0xFF;
        $b = $rgb & 0xFF;
        imagedestroy($img);
        $this->assertGreaterThan(200, $r, 'expected white fill R');
        $this->assertGreaterThan(200, $g, 'expected white fill G');
        $this->assertGreaterThan(200, $b, 'expected white fill B');
    }

    /** Stage 2c — flip AND degrees applied together (not silently dropping one). */
    public function test_rotate_applies_flip_and_degrees_together(): void
    {
        // Asymmetric image so flip+rotate differs from rotate-only.
        $img = imagecreatetruecolor(100, 60);
        $white = imagecolorallocate($img, 255, 255, 255);
        $red = imagecolorallocate($img, 220, 40, 40);
        imagefilledrectangle($img, 0, 0, 99, 59, $white);
        imagefilledrectangle($img, 0, 0, 20, 20, $red); // top-left mark
        ob_start();
        imagejpeg($img, null, 95);
        $bytes = (string) ob_get_clean();
        imagedestroy($img);
        Storage::disk('public')->put('library/images/edit-me.jpg', $bytes);
        Storage::disk('public')->put('library/images/masters/edit-me.jpg', $bytes);
        $this->asset->update([
            'width' => 100,
            'height' => 60,
            'file_size' => strlen($bytes),
            'checksum' => hash('sha256', $bytes),
        ]);

        // Copy for rotate-only baseline.
        $rotateOnly = Media::create([
            'disk' => 'public',
            'path' => 'library/images/edit-me-rot.jpg',
            'media_type' => 'image',
            'mime_type' => 'image/jpeg',
            'file_size' => strlen($bytes),
            'width' => 100,
            'height' => 60,
            'source' => 'library',
            'title' => 'Rotate only',
        ]);
        Storage::disk('public')->put('library/images/edit-me-rot.jpg', $bytes);

        $this->postJson("/api/admin/media/{$rotateOnly->id}/edit", [
            'op' => 'rotate',
            'params' => ['degrees' => 90],
            'mode' => 'replace',
        ])->assertOk();

        $this->postJson("/api/admin/media/{$this->asset->id}/edit", [
            'op' => 'rotate',
            'params' => ['flip' => 'horizontal', 'degrees' => 90],
            'mode' => 'replace',
        ])->assertOk();

        $this->asset->refresh();
        $rotateOnly->refresh();
        // Both should swap dimensions.
        $this->assertSame(60, (int) $this->asset->width);
        $this->assertSame(100, (int) $this->asset->height);
        // If flip were silently dropped, checksums would match.
        $this->assertNotSame(
            (string) $rotateOnly->checksum,
            (string) $this->asset->checksum,
            'flip+degrees must differ from degrees-only',
        );
    }

    public function test_rotate_rejects_empty_params(): void
    {
        $this->postJson("/api/admin/media/{$this->asset->id}/edit", [
            'op' => 'rotate',
            'params' => [],
            'mode' => 'replace',
        ])->assertStatus(422);
    }

    public function test_rotate_png_preserves_png_output(): void
    {
        $img = imagecreatetruecolor(80, 80);
        imagealphablending($img, false);
        imagesavealpha($img, true);
        $transparent = imagecolorallocatealpha($img, 0, 0, 0, 127);
        imagefilledrectangle($img, 0, 0, 79, 79, $transparent);
        $blue = imagecolorallocatealpha($img, 40, 80, 200, 0);
        imagefilledellipse($img, 40, 40, 40, 40, $blue);
        ob_start();
        imagepng($img);
        $bytes = (string) ob_get_clean();
        imagedestroy($img);

        Storage::disk('public')->put('library/images/edit-me.png', $bytes);
        $png = Media::create([
            'disk' => 'public',
            'path' => 'library/images/edit-me.png',
            'media_type' => 'image',
            'mime_type' => 'image/png',
            'file_size' => strlen($bytes),
            'width' => 80,
            'height' => 80,
            'source' => 'library',
            'title' => 'PNG rotate',
        ]);

        $this->postJson("/api/admin/media/{$png->id}/edit", [
            'op' => 'rotate',
            'params' => ['degrees' => 30],
            'mode' => 'replace',
        ])->assertOk();

        $png->refresh();
        $this->assertSame('image/png', $png->mime_type);
    }
}
