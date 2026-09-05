<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\InventoryPurchaseUnit;
use App\Models\PurchaseItem;
use App\Models\StockMovement;
use App\Models\SupplierPriceHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Buying in packs, counting in units.
 *
 * Owner, 2026-09-05: "when i buy 1 egg case, its 7 tray, each tray 30 egg, so
 * total 210 egg, automatically calculate unit price for each egg". Stock is
 * counted in eggs and every downstream figure is per egg. Buying is by the
 * case. The arithmetic between the two is worth pinning down, because getting
 * it wrong does not look wrong: the stock is merely 210 times off, or each egg
 * is valued at the price of the whole box.
 */
class PurchasePackTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    private function eggs(): InventoryItem
    {
        return InventoryItem::create([
            'name' => 'Egg',
            'sku' => 'EGG-1',
            'unit' => 'piece',
            'current_stock' => 0,
            'unit_cost' => 0,
            'is_active' => true,
        ]);
    }

    private function buy(InventoryItem $item, float $qty, float $cost, ?int $packId = null): void
    {
        $this->postJson('/api/purchases', [
            'supplier_name_text' => 'Fahi Store',
            'purchase_date' => now()->toDateString(),
            'status' => 'received',
            'items' => [array_filter([
                'inventory_item_id' => $item->id,
                'quantity' => $qty,
                'unit_cost' => $cost,
                'purchase_unit_id' => $packId,
            ], fn ($v) => $v !== null)],
        ])->assertCreated();
    }

    public function test_a_pack_is_defined_against_the_item_not_the_word_on_the_box(): void
    {
        // The old unit_conversions table is keyed on unit names alone, so it
        // holds one meaning for "case". These two must not collide.
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();
        $water = InventoryItem::create([
            'name' => 'Water', 'sku' => 'WTR-1', 'unit' => 'bottle',
            'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);

        $this->postJson("/api/inventory/{$eggs->id}/purchase-units", ['name' => 'Case', 'base_units' => 210])
            ->assertCreated();
        $this->postJson("/api/inventory/{$water->id}/purchase-units", ['name' => 'Case', 'base_units' => 24])
            ->assertCreated();

        $this->assertEqualsWithDelta(210, (float) $eggs->purchaseUnits()->first()->base_units, 0.000001);
        $this->assertEqualsWithDelta(24, (float) $water->purchaseUnits()->first()->base_units, 0.000001);
    }

    public function test_a_case_can_be_described_as_seven_trays(): void
    {
        // How the owner said it out loud. Stored resolved to the base unit, so
        // pricing never has to walk the chain.
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();

        $tray = $this->postJson("/api/inventory/{$eggs->id}/purchase-units", ['name' => 'Tray', 'base_units' => 30])
            ->assertCreated()->json('purchase_unit');

        $case = $this->postJson("/api/inventory/{$eggs->id}/purchase-units", [
            'name' => 'Case',
            'of_purchase_unit_id' => $tray['id'],
            'of_quantity' => 7,
        ])->assertCreated()->json('purchase_unit');

        $this->assertEqualsWithDelta(210, (float) $case['base_units'], 0.000001);
    }

    public function test_buying_one_case_stocks_210_eggs_and_prices_each_one(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();
        $case = InventoryPurchaseUnit::create([
            'inventory_item_id' => $eggs->id, 'name' => 'Case', 'base_units' => 210,
        ]);

        // One case, MVR 415 for the case.
        $this->buy($eggs, 1, 415, $case->id);

        $eggs->refresh();
        $this->assertEqualsWithDelta(210, (float) $eggs->current_stock, 0.001);

        $line = PurchaseItem::firstOrFail();
        $this->assertEqualsWithDelta(210, (float) $line->quantity, 0.001);
        // 415 / 210 = 1.976190…, not 1.98 and certainly not 415.
        $this->assertEqualsWithDelta(1.976190, (float) $line->unit_cost, 0.000001);
        // What the shop was actually paid stays exact.
        $this->assertEqualsWithDelta(415.00, (float) $line->total_cost, 0.001);
    }

    public function test_the_money_paid_is_never_restated_by_the_division(): void
    {
        // Deriving the total from a rounded per-egg price would turn a MVR 415
        // case into MVR 415.80 and quietly invent 80 laari of spending.
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();
        $case = InventoryPurchaseUnit::create([
            'inventory_item_id' => $eggs->id, 'name' => 'Case', 'base_units' => 210,
        ]);

        $this->buy($eggs, 2, 415, $case->id);

        $line = PurchaseItem::firstOrFail();
        $this->assertEqualsWithDelta(830.00, (float) $line->total_cost, 0.001);
        $this->assertEqualsWithDelta(420, (float) $line->quantity, 0.001);
    }

    public function test_the_pack_is_kept_on_the_line_as_it_was_bought(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();
        $case = InventoryPurchaseUnit::create([
            'inventory_item_id' => $eggs->id, 'name' => 'Case', 'base_units' => 210,
        ]);

        $this->buy($eggs, 2, 415, $case->id);

        // Editing the pack afterwards must not restate what was bought.
        $case->update(['base_units' => 200]);

        $line = PurchaseItem::firstOrFail();
        $this->assertSame('Case', $line->pack_name);
        $this->assertEqualsWithDelta(210, (float) $line->pack_size, 0.000001);
        $this->assertEqualsWithDelta(2, (float) $line->pack_quantity, 0.000001);
    }

    public function test_stock_movement_and_price_history_record_the_per_egg_price(): void
    {
        // Both feed comparisons across items. Recording the case price here
        // would make eggs look 210 times more expensive than they are.
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();
        $case = InventoryPurchaseUnit::create([
            'inventory_item_id' => $eggs->id, 'name' => 'Case', 'base_units' => 210,
        ]);

        $this->buy($eggs, 1, 420, $case->id);

        $movement = StockMovement::where('inventory_item_id', $eggs->id)->firstOrFail();
        $this->assertEqualsWithDelta(210, (float) $movement->quantity, 0.001);
        $this->assertEqualsWithDelta(2.0, (float) $movement->unit_cost, 0.0001);

        $price = SupplierPriceHistory::where('inventory_item_id', $eggs->id)->firstOrFail();
        $this->assertEqualsWithDelta(2.0, (float) $price->unit_price, 0.0001);
    }

    public function test_buying_loose_still_works_exactly_as_before(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();

        $this->buy($eggs, 12, 2.5);

        $eggs->refresh();
        $this->assertEqualsWithDelta(12, (float) $eggs->current_stock, 0.001);

        $line = PurchaseItem::firstOrFail();
        $this->assertEqualsWithDelta(2.5, (float) $line->unit_cost, 0.000001);
        $this->assertEqualsWithDelta(30.00, (float) $line->total_cost, 0.001);
        $this->assertNull($line->pack_name);
    }

    public function test_another_items_pack_is_refused(): void
    {
        // A case of eggs applied to a sack of flour would multiply the wrong
        // stock by 210 and nobody would notice until the shelf count came in.
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();
        $flour = InventoryItem::create([
            'name' => 'Flour', 'sku' => 'FLR-1', 'unit' => 'kg',
            'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);
        $case = InventoryPurchaseUnit::create([
            'inventory_item_id' => $eggs->id, 'name' => 'Case', 'base_units' => 210,
        ]);

        $this->postJson('/api/purchases', [
            'supplier_name_text' => 'Fahi Store',
            'purchase_date' => now()->toDateString(),
            'status' => 'received',
            'items' => [[
                'inventory_item_id' => $flour->id,
                'quantity' => 1,
                'unit_cost' => 415,
                'purchase_unit_id' => $case->id,
            ]],
        ])->assertStatus(422);

        $flour->refresh();
        $this->assertEqualsWithDelta(0, (float) $flour->current_stock, 0.001);
    }

    public function test_a_pack_of_another_item_cannot_be_nested_either(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();
        $flour = InventoryItem::create([
            'name' => 'Flour', 'sku' => 'FLR-1', 'unit' => 'kg',
            'current_stock' => 0, 'unit_cost' => 0, 'is_active' => true,
        ]);
        $tray = InventoryPurchaseUnit::create([
            'inventory_item_id' => $eggs->id, 'name' => 'Tray', 'base_units' => 30,
        ]);

        $this->postJson("/api/inventory/{$flour->id}/purchase-units", [
            'name' => 'Sack',
            'of_purchase_unit_id' => $tray->id,
            'of_quantity' => 7,
        ])->assertStatus(422);
    }

    public function test_a_pack_holding_nothing_is_refused(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();

        $this->postJson("/api/inventory/{$eggs->id}/purchase-units", ['name' => 'Case', 'base_units' => 0])
            ->assertStatus(422);
    }

    public function test_defining_the_same_pack_twice_updates_it(): void
    {
        // Two "Case" rows would make the picker ambiguous.
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $eggs = $this->eggs();

        $this->postJson("/api/inventory/{$eggs->id}/purchase-units", ['name' => 'Case', 'base_units' => 210])->assertCreated();
        $this->postJson("/api/inventory/{$eggs->id}/purchase-units", ['name' => 'case', 'base_units' => 200])->assertOk();

        $this->assertSame(1, $eggs->purchaseUnits()->count());
        $this->assertEqualsWithDelta(200, (float) $eggs->purchaseUnits()->first()->base_units, 0.000001);
    }

    public function test_the_buying_screen_can_list_packs_but_only_stock_staff_define_them(): void
    {
        $eggs = $this->eggs();
        InventoryPurchaseUnit::create([
            'inventory_item_id' => $eggs->id, 'name' => 'Case', 'base_units' => 210,
        ]);

        Sanctum::actingAs($this->makeStaff('staff'), ['staff']);
        $this->getJson("/api/inventory/{$eggs->id}/purchase-units")->assertForbidden();

        Sanctum::actingAs($this->makeManager(), ['staff']);
        $res = $this->getJson("/api/inventory/{$eggs->id}/purchase-units")->assertOk();
        $this->assertSame('piece', $res->json('base_unit'));
        $this->assertCount(1, $res->json('purchase_units'));
    }
}
