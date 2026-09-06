<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Correcting a pack, and knowing what units the store uses.
 *
 * Owner, 2026-09-06: "in inventory edit, cannot see unit list, no pack size
 * edit option". A pack could only be added or destroyed, so fixing a typo in
 * "500 ml tin" meant deleting the name a purchase order was already showing;
 * and Unit was an empty box, with nothing to say what this kitchen counts in.
 */
class PackEditAndUnitListTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    private function ghee(): InventoryItem
    {
        return InventoryItem::create([
            'name' => 'Ghee',
            'sku' => 'GHEE-1',
            'unit' => 'ml',
            'current_stock' => 0,
            'unit_cost' => 0,
            'is_active' => true,
        ]);
    }

    public function test_a_pack_can_be_renamed_and_resized(): void
    {
        $item = $this->ghee();
        $pack = $item->purchaseUnits()->create(['name' => '500 ml tin', 'base_units' => 50]);

        $this->patchJson("/api/inventory/{$item->id}/purchase-units/{$pack->id}", [
            'name' => '500 ml tin (large)',
            'base_units' => 500,
        ])->assertOk()->assertJsonPath('purchase_unit.name', '500 ml tin (large)');

        $this->assertSame(500.0, (float) $pack->fresh()->base_units);
    }

    public function test_only_the_field_that_was_sent_changes(): void
    {
        // Fixing a typo must not silently reset how much is in the tin.
        $item = $this->ghee();
        $pack = $item->purchaseUnits()->create(['name' => '500ml tinn', 'base_units' => 500]);

        $this->patchJson("/api/inventory/{$item->id}/purchase-units/{$pack->id}", [
            'name' => '500 ml tin',
        ])->assertOk();

        $fresh = $pack->fresh();
        $this->assertSame('500 ml tin', $fresh->name);
        $this->assertSame(500.0, (float) $fresh->base_units);
    }

    public function test_two_packs_of_one_item_cannot_share_a_name(): void
    {
        /*
         * The picker would be ambiguous and an old order impossible to trace
         * back to the pack it meant.
         */
        $item = $this->ghee();
        $item->purchaseUnits()->create(['name' => '100 ml tin', 'base_units' => 100]);
        $pack = $item->purchaseUnits()->create(['name' => '500 ml tin', 'base_units' => 500]);

        $this->patchJson("/api/inventory/{$item->id}/purchase-units/{$pack->id}", [
            'name' => '100 ML TIN',
        ])->assertStatus(422);

        $this->assertSame('500 ml tin', $pack->fresh()->name);
    }

    public function test_a_pack_cannot_be_edited_to_hold_nothing(): void
    {
        $item = $this->ghee();
        $pack = $item->purchaseUnits()->create(['name' => 'Tin', 'base_units' => 500]);

        $this->patchJson("/api/inventory/{$item->id}/purchase-units/{$pack->id}", [
            'base_units' => 0,
        ])->assertStatus(422);
    }

    public function test_a_pack_belonging_to_another_item_is_not_reachable(): void
    {
        $mine = $this->ghee();
        $other = InventoryItem::create([
            'name' => 'Oil', 'sku' => 'OIL-1', 'unit' => 'ml',
            'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);
        $theirPack = $other->purchaseUnits()->create(['name' => 'Drum', 'base_units' => 20000]);

        $this->patchJson("/api/inventory/{$mine->id}/purchase-units/{$theirPack->id}", [
            'name' => 'Mine now',
        ])->assertStatus(404);

        $this->assertSame('Drum', $theirPack->fresh()->name);
    }

    public function test_resizing_a_pack_leaves_a_purchase_already_entered_alone(): void
    {
        /*
         * The reason this is safe to offer at all. A purchase line keeps its
         * own copy of the pack — name, size and the per-unit cost worked out
         * at the time — so correcting the definition changes what the *next*
         * order converts to and nothing that already happened.
         */
        $item = $this->ghee();
        $pack = $item->purchaseUnits()->create(['name' => 'Tin', 'base_units' => 500]);

        $purchase = Purchase::create([
            'purchase_number' => 'PO-PACK-1',
            'supplier_id' => Supplier::create(['name' => 'Fahi Store', 'is_active' => true])->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'received',
            'subtotal' => 100,
            'total' => 100,
        ]);
        $line = PurchaseItem::create([
            'purchase_id' => $purchase->id,
            'inventory_item_id' => $item->id,
            'quantity' => 1000,
            'unit_cost' => 0.1,
            'total_cost' => 100,
            'pack_name' => 'Tin',
            'pack_size' => 500,
            'pack_quantity' => 2,
            'received_quantity' => 1000,
            'receive_status' => 'complete',
        ]);

        $this->patchJson("/api/inventory/{$item->id}/purchase-units/{$pack->id}", [
            'base_units' => 750,
        ])->assertOk();

        $fresh = $line->fresh();
        $this->assertSame(500.0, (float) $fresh->pack_size, 'the old order keeps the pack it was entered with');
        $this->assertSame(1000.0, (float) $fresh->quantity);
        $this->assertSame(100.0, (float) $fresh->total_cost);
    }

    public function test_the_inventory_list_says_what_units_are_in_use(): void
    {
        // So the item form can offer a list instead of an empty box.
        $this->ghee();
        InventoryItem::create([
            'name' => 'Rice', 'sku' => 'RICE-1', 'unit' => 'kg',
            'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);
        InventoryItem::create([
            'name' => 'Sugar sachets', 'sku' => 'SUG-1', 'unit' => 'sachet',
            'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);

        $units = $this->getJson('/api/inventory')->assertOk()->json('units');

        $this->assertEqualsCanonicalizing(['kg', 'ml', 'sachet'], $units);
    }

    public function test_the_unit_list_is_the_whole_store_not_the_page_being_searched(): void
    {
        // Searching for "Rice" must not narrow the vocabulary the form offers.
        $this->ghee();
        InventoryItem::create([
            'name' => 'Rice', 'sku' => 'RICE-1', 'unit' => 'kg',
            'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);

        $units = $this->getJson('/api/inventory?search=Rice')->assertOk()->json('units');

        $this->assertEqualsCanonicalizing(['kg', 'ml'], $units);
    }

    public function test_editing_a_pack_needs_the_permission_that_defines_them(): void
    {
        // Reading packs is open to anyone who raises an order — the buying
        // screen needs the picker. Changing one is stock setup.
        $item = $this->ghee();
        $pack = $item->purchaseUnits()->create(['name' => 'Tin', 'base_units' => 500]);

        $buyer = $this->makeStaff('staff');
        $buyer->revokePermission('inventory.manage');
        $buyer->unsetRelation('permissions');
        Sanctum::actingAs($buyer, ['staff']);

        $this->patchJson("/api/inventory/{$item->id}/purchase-units/{$pack->id}", [
            'name' => 'Not allowed',
        ])->assertForbidden();

        $this->assertSame('Tin', $pack->fresh()->name);
    }
}
