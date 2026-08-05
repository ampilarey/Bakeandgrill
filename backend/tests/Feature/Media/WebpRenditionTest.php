<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\Role;
use App\Models\User;
use App\Services\MenuImageProcessor;
use App\Support\ImageCapabilities;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WebpRenditionTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsOwner(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'WebP Owner',
            'email' => 'webp-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    private function jpegAt(int $width, int $height): UploadedFile
    {
        $img = imagecreatetruecolor($width, $height);
        $this->assertNotFalse($img);
        $white = imagecolorallocate($img, 240, 240, 240);
        imagefilledrectangle($img, 0, 0, $width, $height, $white);
        $tmp = tempnam(sys_get_temp_dir(), 'webp');
        imagejpeg($img, $tmp, 80);
        imagedestroy($img);

        return new UploadedFile($tmp, 'photo.jpg', 'image/jpeg', null, true);
    }

    public function test_upload_image_returns_webp_urls_when_supported(): void
    {
        if (!ImageCapabilities::supportsWebp()) {
            $this->markTestSkipped('WebP not supported on this host');
        }

        $this->actingAsOwner();

        $json = $this->post('/api/admin/upload-image', [
            'image' => $this->jpegAt(800, 600),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonStructure([
                'url',
                'thumb_url',
                'image_webp_url',
                'thumb_webp_url',
                'original_url',
                'width',
                'height',
            ])
            ->json();

        $this->assertIsString($json['image_webp_url']);
        $this->assertIsString($json['thumb_webp_url']);
        $this->assertStringStartsWith('/storage/', $json['image_webp_url']);
        $this->assertStringEndsWith('.webp', $json['image_webp_url']);
        $this->assertStringEndsWith('.webp', $json['thumb_webp_url']);

        foreach (['url', 'thumb_url', 'image_webp_url', 'thumb_webp_url'] as $key) {
            $rel = ltrim(substr((string) $json[$key], strlen('/storage/')), '/');
            $this->assertFileExists(storage_path('app/public/' . $rel));
            @unlink(storage_path('app/public/' . $rel));
        }
    }

    public function test_photo_upload_persists_webp_urls(): void
    {
        if (!ImageCapabilities::supportsWebp()) {
            $this->markTestSkipped('WebP not supported on this host');
        }

        $this->actingAsOwner();
        $item = Item::factory()->create();

        $photo = $this->post("/api/items/{$item->id}/photos", [
            'photo' => $this->jpegAt(1000, 750),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->json('photo');

        $this->assertNotEmpty($photo['image_webp_url']);
        $this->assertNotEmpty($photo['thumb_webp_url']);
        $this->assertDatabaseHas('item_photos', [
            'id' => $photo['id'],
            'image_webp_url' => $photo['image_webp_url'],
            'thumb_webp_url' => $photo['thumb_webp_url'],
        ]);

        foreach (['url', 'thumb_url', 'image_webp_url', 'thumb_webp_url'] as $key) {
            $rel = ltrim(substr((string) $photo[$key], strlen('/storage/')), '/');
            @unlink(storage_path('app/public/' . $rel));
        }
    }

    public function test_webp_backfill_is_idempotent_and_uses_crop_not_master(): void
    {
        if (!ImageCapabilities::supportsWebp()) {
            $this->markTestSkipped('WebP not supported on this host');
        }

        $this->actingAsOwner();
        $processor = app(MenuImageProcessor::class);
        $cropRel = $processor->storeProcessed($this->jpegAt(900, 675), 'menu');
        $masterRel = $processor->storeMaster($this->jpegAt(1600, 900), 'menu-masters');

        $item = Item::factory()->create([
            'image_url' => '/storage/' . $cropRel,
            'image_original_url' => '/storage/' . $masterRel,
            'thumb_url' => null,
            'image_webp_url' => null,
            'thumb_webp_url' => null,
        ]);

        // Ensure thumb exists so thumb_webp can be generated too.
        Artisan::call('menu:generate-thumbnails');
        $thumbUrl = $item->fresh()->thumb_url;
        $this->assertNotEmpty($thumbUrl);

        Artisan::call('menu:generate-webp');
        $first = $item->fresh();
        $this->assertNotEmpty($first->image_webp_url);
        $this->assertNotEmpty($first->thumb_webp_url);
        $this->assertStringEndsWith('.webp', $first->image_webp_url);

        // Framing check: WebP dimensions must match the crop, not the master.
        $cropAbs = storage_path('app/public/' . $cropRel);
        $webpAbs = storage_path('app/public/' . ltrim(substr($first->image_webp_url, strlen('/storage/')), '/'));
        $cropSize = getimagesize($cropAbs);
        $webpSize = getimagesize($webpAbs);
        $this->assertSame($cropSize[0], $webpSize[0]);
        $this->assertSame($cropSize[1], $webpSize[1]);

        Artisan::call('menu:generate-webp');
        $second = $item->fresh();
        $this->assertSame($first->image_webp_url, $second->image_webp_url);
        $this->assertSame($first->thumb_webp_url, $second->thumb_webp_url);

        foreach ([$cropRel, $masterRel] as $rel) {
            @unlink(storage_path('app/public/' . $rel));
        }
        foreach ([$first->image_webp_url, $first->thumb_webp_url, $thumbUrl] as $url) {
            $rel = ltrim(substr((string) $url, strlen('/storage/')), '/');
            @unlink(storage_path('app/public/' . $rel));
        }
    }

    public function test_webp_backfill_skips_rows_that_already_have_webp(): void
    {
        if (!ImageCapabilities::supportsWebp()) {
            $this->markTestSkipped('WebP not supported on this host');
        }

        $item = Item::factory()->create([
            'image_url' => '/storage/menu/existing.jpg',
            'image_webp_url' => '/storage/menu/existing.webp',
            'thumb_url' => '/storage/thumbs/existing.jpg',
            'thumb_webp_url' => '/storage/thumbs/existing.webp',
        ]);

        $exit = Artisan::call('menu:generate-webp');
        $this->assertSame(0, $exit);
        $this->assertSame('/storage/menu/existing.webp', $item->fresh()->image_webp_url);
    }
}
