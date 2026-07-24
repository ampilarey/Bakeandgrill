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

    public function test_rotate_free_angle_and_flip(): void
    {
        $this->postJson("/api/admin/media/{$this->asset->id}/edit", [
            'op' => 'rotate',
            'params' => ['degrees' => 45, 'flip' => 'horizontal'],
            'mode' => 'copy',
        ])->assertOk()->assertJsonPath('mode', 'copy');

        $this->postJson("/api/admin/media/{$this->asset->id}/edit", [
            'op' => 'rotate',
            'params' => ['flip' => 'vertical'],
            'mode' => 'copy',
        ])->assertOk();
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
}
