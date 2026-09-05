<?php

declare(strict_types=1);

namespace Tests\Feature\PurchaseRequest;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryCategory;
use App\Models\InventoryItem;
use App\Models\PurchaseRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The list the floor picks from.
 *
 * Owner, 2026-09-05: "cashier, kitchen Staff request items, quantity from the
 * list (he don't write anything)". So the request screen reads a catalogue
 * rather than offering a text box, and this is that catalogue.
 *
 * It is a separate endpoint from `/inventory` on purpose. Kitchen staff can
 * raise a request and hold no `inventory.view`, so reading the inventory list
 * would hide the list from half the people it is for — and a requester needs
 * far less than that list carries.
 */
class PurchaseRequestCatalogTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    private function item(string $name, array $attrs = []): InventoryItem
    {
        return InventoryItem::create(array_merge([
            'name' => $name,
            'unit' => 'kg',
            'current_stock' => 4,
            'unit_cost' => 12.5,
            'is_active' => true,
        ], $attrs));
    }

    public function test_a_cashier_sees_the_items_with_what_they_need_to_ask_sensibly(): void
    {
        $category = InventoryCategory::create(['name' => 'Dry goods', 'slug' => 'dry-goods']);
        $this->item('Flour', [
            'inventory_category_id' => $category->id,
            'unit' => 'kg', 'current_stock' => 2.5, 'reorder_point' => 5, 'reorder_quantity' => 25,
        ]);

        Sanctum::actingAs($this->makeStaff('staff'), ['staff']);
        $res = $this->getJson('/api/purchase-requests/catalog')->assertOk();

        $row = $res->json('items.0');
        $this->assertSame('Flour', $row['name']);
        // The unit comes from the list, so nobody types "kgs" or "KG".
        $this->assertSame('kg', $row['unit']);
        $this->assertSame('Dry goods', $row['category']);
        // What is on the shelf, and what it should be — the question a
        // requester is actually answering.
        $this->assertSame(2.5, $row['current_stock']);
        // JSON collapses 5.0 to 5, so compare by value rather than by type.
        $this->assertEquals(5, $row['reorder_point']);
        $this->assertEquals(25, $row['suggested_qty']);

        // Categories come back for the chips, taken from the items on offer.
        $this->assertSame('Dry goods', $res->json('categories.0.name'));
    }

    public function test_it_never_hands_out_what_the_shop_pays(): void
    {
        /*
         * A requester is not a buyer. Unit cost, last purchase price and the
         * preferred supplier are the shop's buying position, and this endpoint
         * is readable by every cashier and cook — the buyer sees prices later,
         * on the screen where prices are the point.
         */
        $this->item('Cheese', ['unit_cost' => 88.0, 'last_purchase_price' => 91.5]);

        Sanctum::actingAs($this->makeStaff('staff'), ['staff']);
        $row = $this->getJson('/api/purchase-requests/catalog')->assertOk()->json('items.0');

        foreach (['unit_cost', 'last_purchase_price', 'preferred_supplier_id', 'sku'] as $leak) {
            $this->assertArrayNotHasKey($leak, $row);
        }
    }

    public function test_kitchen_staff_can_read_it_without_inventory_view(): void
    {
        // The reason this is not just `/inventory`: kitchen staff raise
        // requests and hold no inventory.view.
        $this->item('Chicken');
        $kitchen = $this->makeKitchenStaff();

        Sanctum::actingAs($kitchen, ['staff']);
        $this->getJson('/api/purchase-requests/catalog')->assertOk()->assertJsonPath('items.0.name', 'Chicken');

        $this->assertFalse(
            $kitchen->fresh()->hasPermission('inventory.view'),
            'If kitchen staff gained inventory.view this test stops proving anything.',
        );
    }

    public function test_an_item_taken_off_the_list_stops_being_offered(): void
    {
        // A 25kg sack bought by the pallet is not something the counter orders.
        $this->item('Table salt');
        $this->item('Bulk salt 25kg', ['requestable' => false]);

        Sanctum::actingAs($this->makeStaff('staff'), ['staff']);
        $names = $this->getJson('/api/purchase-requests/catalog')->assertOk()->json('items.*.name');

        $this->assertSame(['Table salt'], $names);
    }

    public function test_everything_is_requestable_until_the_owner_says_otherwise(): void
    {
        // The column defaults true, so shipping this does not empty the list.
        $item = $this->item('Sugar');

        $this->assertTrue((bool) $item->fresh()->requestable);
    }

    public function test_a_retired_item_is_not_offered(): void
    {
        $this->item('Old sauce', ['is_active' => false]);

        Sanctum::actingAs($this->makeStaff('staff'), ['staff']);
        $this->getJson('/api/purchase-requests/catalog')->assertOk()->assertJsonCount(0, 'items');
    }

    public function test_search_finds_an_item_by_name_sku_or_barcode(): void
    {
        $this->item('Mozzarella', ['sku' => 'CHZ-9', 'barcode' => '5901234123457']);
        $this->item('Tomato paste');

        Sanctum::actingAs($this->makeStaff('staff'), ['staff']);
        foreach (['mozz', 'CHZ-9', '5901234123457'] as $term) {
            $this->getJson('/api/purchase-requests/catalog?search=' . urlencode($term))
                ->assertOk()
                ->assertJsonCount(1, 'items')
                ->assertJsonPath('items.0.name', 'Mozzarella');
        }
    }

    public function test_someone_who_cannot_raise_a_request_cannot_read_the_list(): void
    {
        $this->item('Flour');

        Sanctum::actingAs($this->makeStaff('cashier_no_perms'), ['staff']);
        $this->getJson('/api/purchase-requests/catalog')->assertForbidden();
    }

    public function test_a_picked_item_is_stored_as_the_item_not_as_typed_words(): void
    {
        /*
         * The whole point of picking from a list: the request carries the
         * inventory item's id, so the buyer, the stock movement and the cost
         * all land on the right row instead of on a spelling.
         */
        $flour = $this->item('Flour');

        Sanctum::actingAs($this->makeStaff('staff'), ['staff']);
        $this->postJson('/api/purchase-requests', [
            'source' => 'pos',
            'items' => [[
                'inventory_item_id' => $flour->id,
                'requested_qty' => 3,
                'requested_unit' => 'kg',
                'reason' => 'low_stock',
            ]],
        ])->assertCreated();

        $line = PurchaseRequest::query()->firstOrFail()->items()->firstOrFail();
        $this->assertSame($flour->id, (int) $line->inventory_item_id);
        $this->assertNull($line->free_text_name);
    }
}
