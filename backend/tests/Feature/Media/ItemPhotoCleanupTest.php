<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Models\Item;
use App\Models\ItemPhoto;
use App\Support\MediaFileCleaner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ItemPhotoCleanupTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
    }

    private function putOwned(string $relative): string
    {
        Storage::disk('public')->put($relative, 'fake-bytes');
        $this->assertTrue(Storage::disk('public')->exists($relative));

        return '/storage/'.ltrim($relative, '/');
    }

    public function test_deleting_photo_removes_owned_crop_and_master(): void
    {
        $item = Item::factory()->create();
        $crop = $this->putOwned("item-photos/{$item->id}/a.jpg");
        $master = $this->putOwned("item-photos/{$item->id}/masters/a.jpg");

        $photo = ItemPhoto::create([
            'item_id' => $item->id,
            'url' => $crop,
            'original_url' => $master,
            'sort_order' => 1,
            'is_primary' => false,
        ]);

        $photo->delete();

        $this->assertFalse(Storage::disk('public')->exists("item-photos/{$item->id}/a.jpg"));
        $this->assertFalse(Storage::disk('public')->exists("item-photos/{$item->id}/masters/a.jpg"));
    }

    public function test_shared_master_is_retained_while_still_referenced(): void
    {
        $item = Item::factory()->create();
        $master = $this->putOwned("item-photos/{$item->id}/masters/shared.jpg");
        $cropA = $this->putOwned("item-photos/{$item->id}/a.jpg");
        $cropB = $this->putOwned("item-photos/{$item->id}/b.jpg");

        $photoA = ItemPhoto::create([
            'item_id' => $item->id,
            'url' => $cropA,
            'original_url' => $master,
            'sort_order' => 1,
            'is_primary' => false,
        ]);
        ItemPhoto::create([
            'item_id' => $item->id,
            'url' => $cropB,
            'original_url' => $master,
            'sort_order' => 2,
            'is_primary' => false,
        ]);

        $photoA->delete();

        $this->assertFalse(Storage::disk('public')->exists("item-photos/{$item->id}/a.jpg"));
        $this->assertTrue(Storage::disk('public')->exists("item-photos/{$item->id}/masters/shared.jpg"));
        $this->assertTrue(Storage::disk('public')->exists("item-photos/{$item->id}/b.jpg"));
    }

    public function test_deleting_item_removes_main_gallery_and_masters(): void
    {
        $main = $this->putOwned('menu/main.jpg');
        $mainMaster = $this->putOwned('menu-masters/main.jpg');
        $item = Item::factory()->create([
            'image_url' => $main,
            'image_original_url' => $mainMaster,
        ]);

        $crop = $this->putOwned("item-photos/{$item->id}/g.jpg");
        $master = $this->putOwned("item-photos/{$item->id}/masters/g.jpg");
        ItemPhoto::create([
            'item_id' => $item->id,
            'url' => $crop,
            'original_url' => $master,
            'sort_order' => 1,
            'is_primary' => true,
        ]);

        $item->delete();

        $this->assertFalse(Storage::disk('public')->exists('menu/main.jpg'));
        $this->assertFalse(Storage::disk('public')->exists('menu-masters/main.jpg'));
        $this->assertFalse(Storage::disk('public')->exists("item-photos/{$item->id}/g.jpg"));
        $this->assertFalse(Storage::disk('public')->exists("item-photos/{$item->id}/masters/g.jpg"));
        $this->assertSame(0, ItemPhoto::where('item_id', $item->id)->count());
    }

    public function test_shared_master_across_items_survives_one_item_delete(): void
    {
        $shared = $this->putOwned('menu-masters/shared.jpg');
        $itemA = Item::factory()->create([
            'image_url' => $this->putOwned('menu/a.jpg'),
            'image_original_url' => $shared,
        ]);
        $itemB = Item::factory()->create([
            'image_url' => $this->putOwned('menu/b.jpg'),
            'image_original_url' => $shared,
        ]);

        $itemA->delete();

        $this->assertFalse(Storage::disk('public')->exists('menu/a.jpg'));
        $this->assertTrue(Storage::disk('public')->exists('menu-masters/shared.jpg'));
        $this->assertTrue(Storage::disk('public')->exists('menu/b.jpg'));
        $this->assertSame($shared, $itemB->fresh()->image_original_url);
    }

    public function test_seed_and_external_urls_are_never_deleted(): void
    {
        Storage::disk('public')->put('images/cafe/seed.jpg', 'should-not-matter');

        $item = Item::factory()->create([
            'image_url' => '/images/cafe/burger.jpg',
            'image_original_url' => 'https://cdn.example.com/remote.jpg',
        ]);

        $this->assertFalse(MediaFileCleaner::isOwnedUpload('/images/cafe/burger.jpg'));
        $this->assertFalse(MediaFileCleaner::isOwnedUpload('https://cdn.example.com/remote.jpg'));
        $this->assertNull(MediaFileCleaner::storagePathFromUrl('/images/cafe/burger.jpg'));
        $this->assertNull(MediaFileCleaner::storagePathFromUrl('https://cdn.example.com/remote.jpg'));

        $item->delete();

        // Fake disk path was never a real seed; ensure cleaner did not try owned delete
        $this->assertTrue(Storage::disk('public')->exists('images/cafe/seed.jpg'));
    }

    public function test_cleaner_skips_unreferenced_check_for_non_owned(): void
    {
        $deleted = MediaFileCleaner::deleteIfOwnedAndUnreferenced('https://example.com/x.jpg');
        $this->assertFalse($deleted);

        $deletedSeed = MediaFileCleaner::deleteIfOwnedAndUnreferenced('/images/cafe/x.jpg');
        $this->assertFalse($deletedSeed);
    }
}
