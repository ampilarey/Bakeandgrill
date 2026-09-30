<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\ItemPhoto;
use App\Models\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-30: "there is no option to pic from the library" on an
 * item's Photos tab. A gallery photo can now point at a Media Library photo.
 */
class GalleryPickFromLibraryTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $category = Category::create(['name' => 'Short eats', 'is_active' => true]);
        $this->item = Item::create([
            'name' => 'Boakiba', 'category_id' => $category->id, 'base_price' => 15,
            'is_active' => true, 'is_available' => true,
        ]);
    }

    private function media(string $type = 'image'): Media
    {
        Storage::disk('public')->put('library/boakiba.jpg', 'fake');

        return Media::create([
            'disk' => 'public', 'path' => 'library/boakiba.jpg', 'media_type' => $type,
            'mime_type' => $type === 'image' ? 'image/jpeg' : 'video/mp4', 'file_size' => 100,
            'width' => 1200, 'height' => 900, 'source' => 'library', 'title' => 'boakiba.jpg',
            'thumb_url' => '/storage/library/thumbs/boakiba.jpg', 'alt_text' => 'Boakiba slice',
        ]);
    }

    public function test_a_library_photo_joins_the_gallery_without_a_copy(): void
    {
        $media = $this->media();

        $this->postJson("/api/items/{$this->item->id}/photos", ['media_id' => $media->id])
            ->assertCreated()
            ->assertJsonPath('photo.url', $media->url)
            ->assertJsonPath('photo.thumb_url', '/storage/library/thumbs/boakiba.jpg')
            ->assertJsonPath('photo.alt_text', 'Boakiba slice');

        $this->assertSame(1, ItemPhoto::where('item_id', $this->item->id)->count());
    }

    public function test_removing_it_from_the_gallery_keeps_the_library_file(): void
    {
        $media = $this->media();
        $photoId = $this->postJson("/api/items/{$this->item->id}/photos", ['media_id' => $media->id])->json('photo.id');

        $this->deleteJson("/api/items/{$this->item->id}/photos/{$photoId}")->assertOk();

        Storage::disk('public')->assertExists('library/boakiba.jpg');
    }

    public function test_a_video_from_the_library_is_refused(): void
    {
        $media = $this->media('video');

        $this->postJson("/api/items/{$this->item->id}/photos", ['media_id' => $media->id])
            ->assertStatus(422);
    }
}
