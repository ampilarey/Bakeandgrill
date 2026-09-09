<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryBrandPhoto;
use App\Models\InventoryItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-09: "can i upload a pic of different brand of item to know
 * which brand is this."
 *
 * Brand stays free text on the purchase line, as it always has been. This
 * hangs one picture off the pair that already exists — the item and the
 * brand somebody typed — so the person in the shop can see which tin to
 * pick up.
 */
class InventoryBrandPhotoTest extends TestCase
{
    use RefreshDatabase;

    private InventoryItem $egg;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Storage::fake('public');
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->egg = InventoryItem::create([
            'name' => 'Egg', 'unit' => 'piece', 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);
    }

    private function upload(string $brand, string $file = 'sunrise.jpg'): \Illuminate\Testing\TestResponse
    {
        return $this->post("/api/inventory/{$this->egg->id}/brand-photos", [
            'brand' => $brand,
            'photo' => UploadedFile::fake()->image($file, 400, 400),
        ]);
    }

    public function test_a_picture_can_be_kept_for_a_brand(): void
    {
        $photo = $this->upload('Sunrise')->assertCreated()->json('photo');

        $this->assertSame('Sunrise', $photo['brand']);
        $this->assertNotEmpty($photo['url']);

        $row = InventoryBrandPhoto::firstOrFail();
        $this->assertSame('sunrise', $row->brand_key);
        Storage::disk('public')->assertExists($row->file_path);
    }

    public function test_one_brand_keeps_one_picture_and_the_old_file_goes(): void
    {
        $first = $this->upload('Sunrise', 'old.jpg')->assertCreated();
        $oldPath = InventoryBrandPhoto::firstOrFail()->file_path;

        $this->upload('Sunrise', 'new.jpg')->assertCreated();

        $this->assertSame(1, InventoryBrandPhoto::count());
        $row = InventoryBrandPhoto::firstOrFail();
        $this->assertNotSame($oldPath, $row->file_path);
        Storage::disk('public')->assertMissing($oldPath);
        Storage::disk('public')->assertExists($row->file_path);
        $this->assertNotSame($first->json('photo.url'), $row->url());
    }

    public function test_the_same_brand_typed_differently_is_the_same_brand(): void
    {
        $this->upload('Sunrise')->assertCreated();
        $this->upload('  sunrise  ')->assertCreated();
        $this->upload('SUN   RISE')->assertCreated();

        // Case and stray spaces fold together; a different word does not.
        $this->assertSame(2, InventoryBrandPhoto::count());
        $this->assertEqualsCanonicalizing(
            ['sunrise', 'sun rise'],
            InventoryBrandPhoto::pluck('brand_key')->all(),
        );
    }

    public function test_two_brands_of_one_item_each_keep_their_own(): void
    {
        $this->upload('Sunrise')->assertCreated();
        $this->upload('Royal')->assertCreated();

        $photos = $this->getJson("/api/inventory/{$this->egg->id}/brand-photos")->assertOk()->json('photos');

        $this->assertCount(2, $photos);
        $this->assertEqualsCanonicalizing(['Royal', 'Sunrise'], array_column($photos, 'brand'));
    }

    public function test_a_picture_can_be_removed(): void
    {
        $id = $this->upload('Sunrise')->json('photo.id');
        $path = InventoryBrandPhoto::findOrFail($id)->file_path;

        $this->deleteJson("/api/inventory/{$this->egg->id}/brand-photos/{$id}")->assertOk();

        $this->assertSame(0, InventoryBrandPhoto::count());
        Storage::disk('public')->assertMissing($path);
    }

    public function test_a_picture_belonging_to_another_item_cannot_be_removed_through_this_one(): void
    {
        $flour = InventoryItem::create([
            'name' => 'Flour', 'unit' => 'kg', 'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);
        $id = $this->upload('Sunrise')->json('photo.id');

        $this->deleteJson("/api/inventory/{$flour->id}/brand-photos/{$id}")->assertNotFound();

        $this->assertSame(1, InventoryBrandPhoto::count());
    }

    public function test_it_refuses_something_that_is_not_a_picture(): void
    {
        $this->post("/api/inventory/{$this->egg->id}/brand-photos", [
            'brand' => 'Sunrise',
            'photo' => UploadedFile::fake()->create('prices.pdf', 40, 'application/pdf'),
        ])->assertStatus(422)->assertJsonValidationErrors('photo');

        $this->post("/api/inventory/{$this->egg->id}/brand-photos", [
            'brand' => '   ',
            'photo' => UploadedFile::fake()->image('a.jpg'),
        ])->assertStatus(422)->assertJsonValidationErrors('brand');
    }

    public function test_the_buying_screen_gets_the_pictures_with_the_brands(): void
    {
        $this->upload('Sunrise')->assertCreated();

        $res = $this->getJson("/api/inventory/{$this->egg->id}/purchase-units")->assertOk();

        // Keyed by the folded brand, so a screen can look one up directly.
        $this->assertSame('Sunrise', $res->json('brand_photos.sunrise.brand'));
        $this->assertNotEmpty($res->json('brand_photos.sunrise.url'));
    }

    public function test_the_price_table_gets_them_too(): void
    {
        $this->upload('Royal')->assertCreated();

        $res = $this->getJson("/api/inventory/{$this->egg->id}/cost-usage")->assertOk();

        $this->assertSame('Royal', $res->json('brand_photos.royal.brand'));
    }

    public function test_a_cook_can_look_one_up_but_not_change_it(): void
    {
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $cashier = User::create([
            'name' => 'Cashier', 'email' => 'till@test.com', 'password' => Hash::make('password'),
            'role_id' => Role::where('slug', 'staff')->firstOrFail()->id,
            'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $cashier->grantPermission('inventory.view');
        Sanctum::actingAs($cashier, ['staff']);

        $this->getJson("/api/inventory/{$this->egg->id}/brand-photos")->assertOk();
        $this->post("/api/inventory/{$this->egg->id}/brand-photos", [
            'brand' => 'Sunrise',
            'photo' => UploadedFile::fake()->image('a.jpg'),
        ])->assertForbidden();
    }

    public function test_removing_the_item_takes_its_pictures_with_it(): void
    {
        $this->upload('Sunrise')->assertCreated();

        $this->egg->delete();

        $this->assertSame(0, InventoryBrandPhoto::count());
    }

    /*
     * Owner, 2026-09-09: "i want to save more than one brand, and photo is
     * optional." The brand is the fact worth recording; the picture is the
     * extra that makes a shelf recognisable, and it can follow later.
     */

    private function saveBrand(string $brand): \Illuminate\Testing\TestResponse
    {
        return $this->post("/api/inventory/{$this->egg->id}/brand-photos", ['brand' => $brand]);
    }

    public function test_a_brand_can_be_written_down_with_no_picture(): void
    {
        $photo = $this->saveBrand('GRB')->assertCreated()->json('photo');

        $this->assertSame('GRB', $photo['brand']);
        $this->assertNull($photo['url']);
        $this->assertNull(InventoryBrandPhoto::firstOrFail()->file_path);
    }

    public function test_several_brands_can_be_written_down_without_any_pictures(): void
    {
        $this->saveBrand('GRB')->assertCreated();
        $this->saveBrand('Rani')->assertCreated();
        $this->saveBrand('Everest')->assertCreated();

        $photos = $this->getJson("/api/inventory/{$this->egg->id}/brand-photos")->assertOk()->json('photos');

        $this->assertCount(3, $photos);
        $this->assertEqualsCanonicalizing(['Everest', 'GRB', 'Rani'], array_column($photos, 'brand'));
        $this->assertSame([null, null, null], array_column($photos, 'url'));
    }

    public function test_a_picture_can_follow_the_brand_later(): void
    {
        $id = $this->saveBrand('GRB')->assertCreated()->json('photo.id');

        $this->upload('GRB')->assertCreated();

        // Still one brand, now with a picture on it.
        $this->assertSame(1, InventoryBrandPhoto::count());
        $row = InventoryBrandPhoto::findOrFail($id);
        $this->assertNotNull($row->file_path);
        Storage::disk('public')->assertExists($row->file_path);
    }

    public function test_saving_the_brand_again_does_not_take_its_picture_down(): void
    {
        $this->upload('Sunrise')->assertCreated();
        $path = InventoryBrandPhoto::firstOrFail()->file_path;

        // Correcting the spelling, with no new file attached.
        $this->saveBrand('SUNRISE')->assertCreated();

        $row = InventoryBrandPhoto::firstOrFail();
        $this->assertSame($path, $row->file_path);
        $this->assertSame('SUNRISE', $row->brand);
        Storage::disk('public')->assertExists($path);
    }

    public function test_a_brand_with_no_picture_can_be_removed(): void
    {
        $id = $this->saveBrand('GRB')->assertCreated()->json('photo.id');

        $this->deleteJson("/api/inventory/{$this->egg->id}/brand-photos/{$id}")->assertOk();

        $this->assertSame(0, InventoryBrandPhoto::count());
    }

    public function test_a_brand_still_needs_a_name(): void
    {
        $this->saveBrand('   ')->assertStatus(422)->assertJsonValidationErrors('brand');
    }

    public function test_a_brand_written_down_is_offered_on_the_buying_screen(): void
    {
        // The point of recording it: the pick list helps the very first line
        // that mentions the brand, not only the ones after it.
        $this->saveBrand('GRB')->assertCreated();

        $res = $this->getJson("/api/inventory/{$this->egg->id}/purchase-units")->assertOk();

        $this->assertContains('GRB', $res->json('brands'));
        $this->assertNull($res->json('brand_photos.grb.url'));
    }
}
