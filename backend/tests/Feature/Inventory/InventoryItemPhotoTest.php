<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Helpers\ModelHelpers;
use Tests\TestCase;

/**
 * Owner, 2026-09-18: "is there any option to add inventory item photo - not
 * brand". One picture of the ingredient itself, carried on every list that
 * names it.
 */
class InventoryItemPhotoTest extends TestCase
{
    use ModelHelpers;
    use RefreshDatabase;

    private InventoryItem $flour;

    protected function setUp(): void
    {
        parent::setUp();
        foreach (['owner' => 'Owner', 'manager' => 'Manager', 'staff' => 'Staff', 'kitchen_staff' => 'Kitchen Staff'] as $slug => $name) {
            Role::firstOrCreate(['slug' => $slug], ['name' => $name, 'is_active' => true]);
        }
        PermissionCatalogSync::sync();
        Storage::fake('public');
        $this->flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'unit_cost' => 40, 'is_active' => true, 'requestable' => true]);
    }

    public function test_the_owner_can_add_replace_and_remove_the_items_picture(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $first = $this->post("/api/inventory/{$this->flour->id}/photo", ['photo' => UploadedFile::fake()->image('flour.jpg', 300, 300)])
            ->assertCreated()
            ->json('photo_url');
        $this->assertNotNull($first);
        $firstPath = $this->flour->fresh()->photo_path;
        Storage::disk('public')->assertExists($firstPath);

        // The list carries it.
        $this->getJson('/api/inventory')->assertOk()->assertJsonPath('items.data.0.photo_url', $first);

        // Uploading again replaces the file rather than leaving a pile.
        $this->post("/api/inventory/{$this->flour->id}/photo", ['photo' => UploadedFile::fake()->image('flour2.png', 300, 300)])->assertCreated();
        Storage::disk('public')->assertMissing($firstPath);
        Storage::disk('public')->assertExists($this->flour->fresh()->photo_path);

        $this->deleteJson("/api/inventory/{$this->flour->id}/photo")->assertOk()->assertJsonPath('photo_url', null);
        $this->assertNull($this->flour->fresh()->photo_path);
        $this->assertCount(0, Storage::disk('public')->allFiles());
    }

    /**
     * Audit, 2026-09-18: uploads were kept exactly as sent, so a 6 MB phone
     * photo was downloaded by every buying list that showed it as a thumb.
     * Fitted within 1200px and re-encoded as JPEG, whatever came in.
     */
    public function test_the_picture_is_fitted_within_1200px_and_kept_as_jpeg(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->post("/api/inventory/{$this->flour->id}/photo", ['photo' => UploadedFile::fake()->image('big.png', 3000, 1500)])->assertCreated();

        $path = $this->flour->fresh()->photo_path;
        $this->assertStringEndsWith('.jpg', $path);
        [$w, $h] = getimagesizefromstring(Storage::disk('public')->get($path));
        $this->assertSame(1200, $w);
        $this->assertSame(600, $h);
    }

    /**
     * Audit, 2026-09-18: deleting an item cascaded the rows and left the
     * files. The picture and every packet picture go with the item.
     */
    public function test_deleting_the_item_removes_its_pictures_from_the_disk(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->post("/api/inventory/{$this->flour->id}/photo", ['photo' => UploadedFile::fake()->image('flour.jpg', 300, 300)])->assertCreated();
        $this->post("/api/inventory/{$this->flour->id}/brand-photos", ['brand' => 'Sunrise', 'photo' => UploadedFile::fake()->image('sunrise.jpg', 300, 300)])->assertCreated();
        $this->assertCount(2, Storage::disk('public')->allFiles());

        $this->deleteJson("/api/inventory/{$this->flour->id}")->assertOk();

        $this->assertNull(InventoryItem::find($this->flour->id));
        $this->assertCount(0, Storage::disk('public')->allFiles());
    }

    public function test_the_picture_reaches_the_kitchens_request_list(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->post("/api/inventory/{$this->flour->id}/photo", ['photo' => UploadedFile::fake()->image('flour.jpg', 300, 300)])->assertCreated();

        Sanctum::actingAs($this->makeKitchenStaff(), ['staff']);
        $row = collect($this->getJson('/api/purchase-requests/catalog')->assertOk()->json('items'))->firstWhere('id', $this->flour->id);
        $this->assertNotNull($row['photo_url']);
    }

    public function test_only_stock_managers_may_change_it_and_it_must_be_an_image(): void
    {
        Sanctum::actingAs($this->makeKitchenStaff(), ['staff']);
        $this->post("/api/inventory/{$this->flour->id}/photo", ['photo' => UploadedFile::fake()->image('flour.jpg')])->assertForbidden();

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->post("/api/inventory/{$this->flour->id}/photo", ['photo' => UploadedFile::fake()->create('flour.pdf', 10, 'application/pdf')])
            ->assertStatus(422);
        $this->post("/api/inventory/{$this->flour->id}/photo", [])->assertStatus(422);
    }
}
