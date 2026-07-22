<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Role;
use App\Models\User;
use App\Services\MenuImageProcessor;
use App\Support\MediaFileCleaner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CategoryMediaTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsOwner(): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Category Media Owner',
            'email' => 'cat-media-owner@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);

        return $user;
    }

    private function putOwned(string $relative): string
    {
        Storage::disk('public')->put($relative, 'fake-bytes');
        $this->assertTrue(Storage::disk('public')->exists($relative));

        return '/storage/'.ltrim($relative, '/');
    }

    private function jpegAt(int $width, int $height): UploadedFile
    {
        $img = imagecreatetruecolor($width, $height);
        $this->assertNotFalse($img);
        $white = imagecolorallocate($img, 240, 240, 240);
        imagefilledrectangle($img, 0, 0, $width, $height, $white);
        $tmp = tempnam(sys_get_temp_dir(), 'catthumb');
        imagejpeg($img, $tmp, 80);
        imagedestroy($img);

        return new UploadedFile($tmp, 'category.jpg', 'image/jpeg', null, true);
    }

    public function test_deleting_category_removes_owned_crop_master_and_thumb(): void
    {
        Storage::fake('public');
        $crop = $this->putOwned('menu/cat-crop.jpg');
        $master = $this->putOwned('menu-masters/cat-master.jpg');
        $thumb = $this->putOwned('thumbs/cat-thumb.jpg');

        $category = Category::create([
            'name' => 'Owned Media',
            'slug' => 'owned-media',
            'is_active' => true,
            'image_url' => $crop,
            'image_original_url' => $master,
            'thumb_url' => $thumb,
        ]);

        $category->delete();

        $this->assertFalse(Storage::disk('public')->exists('menu/cat-crop.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('menu-masters/cat-master.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('thumbs/cat-thumb.jpg'));
    }

    public function test_deleting_category_never_deletes_shared_seed_or_external_urls(): void
    {
        Storage::fake('public');
        $shared = $this->putOwned('menu-masters/shared-cat.jpg');
        $cropA = $this->putOwned('menu/cat-a.jpg');
        $cropB = $this->putOwned('menu/cat-b.jpg');

        $categoryA = Category::create([
            'name' => 'Cat A',
            'slug' => 'cat-a',
            'is_active' => true,
            'image_url' => $cropA,
            'image_original_url' => $shared,
        ]);
        Category::create([
            'name' => 'Cat B',
            'slug' => 'cat-b',
            'is_active' => true,
            'image_url' => $cropB,
            'image_original_url' => $shared,
        ]);

        $seedCategory = Category::create([
            'name' => 'Seed Cat',
            'slug' => 'seed-cat',
            'is_active' => true,
            'image_url' => '/images/cafe/grills.jpg',
        ]);

        $externalCategory = Category::create([
            'name' => 'External Cat',
            'slug' => 'external-cat',
            'is_active' => true,
            'image_url' => 'https://cdn.example.com/category.jpg',
        ]);

        $categoryA->delete();
        $seedCategory->delete();
        $externalCategory->delete();

        $this->assertFalse(Storage::disk('public')->exists('menu/cat-a.jpg'));
        $this->assertTrue(Storage::disk('public')->exists('menu-masters/shared-cat.jpg'));
        $this->assertTrue(Storage::disk('public')->exists('menu/cat-b.jpg'));
        $this->assertFalse(MediaFileCleaner::isOwnedUpload('/images/cafe/grills.jpg'));
        $this->assertFalse(MediaFileCleaner::isOwnedUpload('https://cdn.example.com/category.jpg'));
    }

    public function test_updating_category_image_deletes_superseded_owned_file_only(): void
    {
        Storage::fake('public');
        $this->actingAsOwner();
        $old = $this->putOwned('menu/cat-old.jpg');
        $oldMaster = $this->putOwned('menu-masters/cat-old.jpg');
        $oldThumb = $this->putOwned('thumbs/cat-old.jpg');
        $shared = $this->putOwned('menu-masters/shared-keep.jpg');

        $category = Category::create([
            'name' => 'Replace Me',
            'slug' => 'replace-me',
            'is_active' => true,
            'image_url' => $old,
            'image_original_url' => $oldMaster,
            'thumb_url' => $oldThumb,
        ]);
        Category::create([
            'name' => 'Still Uses Shared',
            'slug' => 'still-shared',
            'is_active' => true,
            'image_url' => $this->putOwned('menu/other.jpg'),
            'image_original_url' => $shared,
        ]);

        $new = $this->putOwned('menu/cat-new.jpg');
        $newMaster = $this->putOwned('menu-masters/cat-new.jpg');
        $newThumb = $this->putOwned('thumbs/cat-new.jpg');

        $this->patchJson("/api/categories/{$category->id}", [
            'image_url' => $new,
            'image_original_url' => $newMaster,
            'thumb_url' => $newThumb,
        ])->assertOk();

        $this->assertFalse(Storage::disk('public')->exists('menu/cat-old.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('menu-masters/cat-old.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('thumbs/cat-old.jpg'));
        $this->assertTrue(Storage::disk('public')->exists('menu-masters/shared-keep.jpg'));
        $this->assertTrue(Storage::disk('public')->exists('menu/cat-new.jpg'));
        $this->assertTrue(Storage::disk('public')->exists('menu-masters/cat-new.jpg'));
        $this->assertTrue(Storage::disk('public')->exists('thumbs/cat-new.jpg'));

        $fresh = $category->fresh();
        $this->assertSame($new, $fresh->image_url);
        $this->assertSame($newMaster, $fresh->image_original_url);
        $this->assertSame($newThumb, $fresh->thumb_url);
    }

    public function test_store_persists_image_original_url_and_generates_thumb_url(): void
    {
        $this->actingAsOwner();
        $processor = app(MenuImageProcessor::class);
        $cropRel = $processor->storeProcessed($this->jpegAt(800, 600), 'menu');
        $masterRel = $processor->storeMaster($this->jpegAt(1200, 900), 'menu-masters');
        $cropUrl = '/storage/'.$cropRel;
        $masterUrl = '/storage/'.$masterRel;

        $category = $this->postJson('/api/categories', [
            'name' => 'With Media',
            'is_active' => true,
            'image_url' => $cropUrl,
            'image_original_url' => $masterUrl,
        ])
            ->assertCreated()
            ->json('category');

        $this->assertSame($cropUrl, $category['image_url']);
        $this->assertSame($masterUrl, $category['image_original_url']);
        $this->assertNotEmpty($category['thumb_url']);
        $this->assertStringStartsWith('/storage/', $category['thumb_url']);

        $thumbRel = ltrim(substr((string) $category['thumb_url'], strlen('/storage/')), '/');
        $this->assertFileExists(storage_path('app/public/'.$thumbRel));

        @unlink(storage_path('app/public/'.$cropRel));
        @unlink(storage_path('app/public/'.$masterRel));
        @unlink(storage_path('app/public/'.$thumbRel));
    }

    public function test_category_thumbnail_backfill_is_idempotent(): void
    {
        $this->actingAsOwner();
        $processor = app(MenuImageProcessor::class);
        $cropRel = $processor->storeProcessed($this->jpegAt(900, 675), 'menu');
        $category = Category::create([
            'name' => 'Backfill Cat',
            'slug' => 'backfill-cat',
            'is_active' => true,
            'image_url' => '/storage/'.$cropRel,
            'thumb_url' => null,
        ]);

        Artisan::call('menu:generate-thumbnails');
        $first = $category->fresh()->thumb_url;
        $this->assertNotEmpty($first);

        Artisan::call('menu:generate-thumbnails');
        $this->assertSame($first, $category->fresh()->thumb_url);

        @unlink(storage_path('app/public/'.$cropRel));
        $thumbRel = ltrim(substr((string) $first, strlen('/storage/')), '/');
        @unlink(storage_path('app/public/'.$thumbRel));
    }
}
