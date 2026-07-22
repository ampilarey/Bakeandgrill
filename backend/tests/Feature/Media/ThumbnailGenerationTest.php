<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Models\Role;
use App\Models\User;
use App\Services\MenuImageProcessor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ThumbnailGenerationTest extends TestCase
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
            'name' => 'Thumb Owner',
            'email' => 'thumb-owner@test.local',
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
        $tmp = tempnam(sys_get_temp_dir(), 'thumb');
        imagejpeg($img, $tmp, 80);
        imagedestroy($img);

        return new UploadedFile($tmp, 'photo.jpg', 'image/jpeg', null, true);
    }

    public function test_upload_image_returns_thumb_url(): void
    {
        $this->actingAsOwner();

        $thumb = $this->post('/api/admin/upload-image', [
            'image' => $this->jpegAt(800, 600),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonStructure(['url', 'thumb_url', 'original_url', 'width', 'height'])
            ->json('thumb_url');

        $this->assertIsString($thumb);
        $this->assertStringStartsWith('/storage/', $thumb);
        $rel = ltrim(substr($thumb, strlen('/storage/')), '/');
        $this->assertFileExists(storage_path('app/public/'.$rel));
        @unlink(storage_path('app/public/'.$rel));
    }

    public function test_photo_upload_persists_thumb_url(): void
    {
        $this->actingAsOwner();
        $item = Item::factory()->create();

        $photo = $this->post("/api/items/{$item->id}/photos", [
            'photo' => $this->jpegAt(1000, 750),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->json('photo');

        $this->assertNotEmpty($photo['thumb_url']);
        $this->assertDatabaseHas('item_photos', [
            'id' => $photo['id'],
            'thumb_url' => $photo['thumb_url'],
        ]);

        foreach (['url', 'thumb_url'] as $key) {
            $rel = ltrim(substr((string) $photo[$key], strlen('/storage/')), '/');
            @unlink(storage_path('app/public/'.$rel));
        }
    }

    public function test_backfill_command_is_idempotent(): void
    {
        $this->actingAsOwner();
        $file = $this->jpegAt(900, 675);
        $processor = app(MenuImageProcessor::class);
        $cropRel = $processor->storeProcessed($file, 'menu');
        $item = Item::factory()->create([
            'image_url' => '/storage/'.$cropRel,
            'thumb_url' => null,
        ]);

        Artisan::call('menu:generate-thumbnails');
        $first = $item->fresh()->thumb_url;
        $this->assertNotEmpty($first);

        Artisan::call('menu:generate-thumbnails');
        $this->assertSame($first, $item->fresh()->thumb_url);

        @unlink(storage_path('app/public/'.$cropRel));
        $thumbRel = ltrim(substr((string) $first, strlen('/storage/')), '/');
        @unlink(storage_path('app/public/'.$thumbRel));
    }

    public function test_backfill_skips_rows_that_already_have_thumb(): void
    {
        Item::factory()->create([
            'image_url' => '/storage/menu/x.jpg',
            'thumb_url' => '/storage/thumbs/existing.jpg',
        ]);
        ItemPhoto::create([
            'item_id' => Item::factory()->create()->id,
            'url' => '/storage/item-photos/1/a.jpg',
            'thumb_url' => '/storage/item-photos/1/thumbs/a.jpg',
            'sort_order' => 1,
            'is_primary' => false,
        ]);

        $exit = Artisan::call('menu:generate-thumbnails');
        $this->assertSame(0, $exit);
    }
}
