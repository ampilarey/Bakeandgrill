<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-19: "Where i can see the price difference of each product
 * over time. An easy way to".
 */
class PriceChangesTest extends TestCase
{
    use RefreshDatabase;

    private Supplier $agora;

    private Supplier $fahi;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->agora = Supplier::create(['name' => 'Agora']);
        $this->fahi = Supplier::create(['name' => 'Fahi Store']);
    }

    private function price(InventoryItem $item, Supplier $s, float $price, string $daysAgo, ?int $purchaseId = null): void
    {
        SupplierPriceHistory::create([
            'supplier_id' => $s->id,
            'inventory_item_id' => $item->id,
            'purchase_id' => $purchaseId,
            'unit_price' => $price,
            'unit' => $item->unit,
            'recorded_at' => now()->subDays((int) $daysAgo)->toDateString(),
        ]);
    }

    private function purchase(Supplier $s, string $number): Purchase
    {
        return Purchase::create([
            'purchase_number' => $number,
            'supplier_id' => $s->id,
            'purchase_date' => now()->toDateString(),
            'status' => 'received',
            'subtotal' => 100,
            'total' => 100,
        ]);
    }

    public function test_every_item_shows_its_last_price_against_the_one_before_and_a_month_ago_biggest_rise_first(): void
    {
        $flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'unit_cost' => 12, 'is_active' => true]);
        $eggs = InventoryItem::create(['name' => 'Eggs', 'unit' => 'pcs', 'unit_cost' => 2, 'is_active' => true]);
        $oil = InventoryItem::create(['name' => 'Oil', 'unit' => 'l', 'unit_cost' => 30, 'is_active' => true]);
        $gone = InventoryItem::create(['name' => 'Old thing', 'unit' => 'pcs', 'unit_cost' => 1, 'is_active' => false]);

        // Flour: 10 → 11 → 13 over six weeks. +18.2% on the last buy, +30% on the month.
        $this->price($flour, $this->agora, 10, '45');
        $this->price($flour, $this->fahi, 11, '20');
        $this->price($flour, $this->agora, 13, '2');
        // Eggs: 2.5 → 2.0. Cheaper.
        $this->price($eggs, $this->agora, 2.5, '10');
        $this->price($eggs, $this->fahi, 2.0, '1');
        // Oil: bought once. Nothing to compare with.
        $this->price($oil, $this->agora, 30, '5');
        // Inactive items do not appear.
        $this->price($gone, $this->agora, 1, '5');

        Sanctum::actingAs($this->makeManager(), ['staff']);
        $res = $this->getJson('/api/purchasing/price-changes')->assertOk();

        $names = array_column($res->json('items'), 'name');
        $this->assertSame(['Flour', 'Eggs', 'Oil'], $names);

        $f = $res->json('items.0');
        $this->assertEquals(13, $f['last']['price']);
        $this->assertSame('Agora', $f['last']['supplier']);
        $this->assertEquals(11, $f['previous']['price']);
        $this->assertSame('Fahi Store', $f['previous']['supplier']);
        $this->assertEquals(10, $f['month_ago']['price']);
        $this->assertEquals(18.2, $f['change_pct']);
        $this->assertEquals(30, $f['change_pct_month']);
        $this->assertCount(3, $f['sparkline']);

        $e = $res->json('items.1');
        $this->assertEquals(-20, $e['change_pct']);
        $this->assertNull($e['month_ago']);

        $o = $res->json('items.2');
        $this->assertNull($o['previous']);
        $this->assertNull($o['change_pct']);

        $this->assertSame(['items' => 3, 'up_over_10' => 1, 'up' => 1, 'down' => 1, 'unchanged' => 0, 'single_price' => 1], $res->json('summary'));
    }

    public function test_two_lines_of_one_delivery_are_not_a_price_change(): void
    {
        $flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'unit_cost' => 12, 'is_active' => true]);
        $old = $this->purchase($this->agora, 'PO-1');
        $new = $this->purchase($this->agora, 'PO-2');
        $this->price($flour, $this->agora, 10, '30', $old->id);
        $this->price($flour, $this->agora, 12, '2', $new->id);
        $this->price($flour, $this->agora, 12, '2', $new->id);

        Sanctum::actingAs($this->makeManager(), ['staff']);
        $f = $this->getJson('/api/purchasing/price-changes')->assertOk()->json('items.0');

        $this->assertEquals(10, $f['previous']['price']);
        $this->assertEquals(20, $f['change_pct']);
    }

    public function test_one_items_history_lists_every_price_with_who_charged_it(): void
    {
        $flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'unit_cost' => 12, 'is_active' => true]);
        $this->price($flour, $this->agora, 10, '45');
        $this->price($flour, $this->fahi, 11, '20');

        Sanctum::actingAs($this->makeManager(), ['staff']);
        $res = $this->getJson("/api/purchasing/price-changes/{$flour->id}")->assertOk();

        $this->assertSame('Flour', $res->json('item.name'));
        $this->assertEquals([10, 11], array_column($res->json('points'), 'price'));
        $this->assertSame(['Agora', 'Fahi Store'], array_column($res->json('points'), 'supplier'));

        $this->getJson('/api/purchasing/price-changes/999999')->assertNotFound();
    }

    public function test_it_is_for_buyers_and_money_readers_only(): void
    {
        Sanctum::actingAs($this->makeKitchenStaff(), ['staff']);
        $this->getJson('/api/purchasing/price-changes')->assertForbidden();
    }
}
