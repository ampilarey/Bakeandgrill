<?php

declare(strict_types=1);

namespace Tests\Feature\Purchasing;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\InventoryPurchaseUnit;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Best price and total used, across brands and sizes.
 *
 * Owner, 2026-09-06: "same item has different brands and different sizes.
 * Sometime we buy different brands and different sizes. I need to know the
 * best price and total quantity of the product utilized even though different
 * brands and sizes."
 *
 * The whole answer rests on one rule: **compare per base unit, never per
 * pack**. A 500 ml tin at MVR 95 and a 100 ml tin at MVR 17 are not comparable
 * as tins, and the bigger one is not reliably the cheaper — 0.19/ml against
 * 0.17/ml says the small tin wins, which is exactly the kind of thing nobody
 * notices by eye.
 */
class InventoryCostUsageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    private InventoryPurchaseUnit $smallTin;

    private InventoryPurchaseUnit $bigTin;

    private function ghee(): InventoryItem
    {
        $item = InventoryItem::create([
            'name' => 'Ghee',
            'sku' => 'GHEE-1',
            'unit' => 'ml',
            'current_stock' => 0,
            'unit_cost' => 0,
            'is_active' => true,
        ]);
        $this->smallTin = InventoryPurchaseUnit::create([
            'inventory_item_id' => $item->id, 'name' => '100 ml tin', 'base_units' => 100,
        ]);
        $this->bigTin = InventoryPurchaseUnit::create([
            'inventory_item_id' => $item->id, 'name' => '500 ml tin', 'base_units' => 500,
        ]);

        return $item;
    }

    private function supplier(string $name): Supplier
    {
        return Supplier::create(['name' => $name, 'is_active' => true]);
    }

    /**
     * Buy some, the way the admin does: so many packs at the price of a pack.
     * The server divides it down to the base unit, which is what makes any of
     * this comparable.
     */
    private function buy(
        InventoryItem $item,
        Supplier $supplier,
        string $brand,
        InventoryPurchaseUnit $pack,
        float $packs,
        float $packPrice,
        string $date,
    ): void {
        $this->postJson('/api/purchases', [
            'supplier_id' => $supplier->id,
            'purchase_date' => $date,
            'status' => 'received',
            'items' => [[
                'inventory_item_id' => $item->id,
                'quantity' => $packs,
                'unit_cost' => $packPrice,
                'purchase_unit_id' => $pack->id,
                'brand' => $brand,
            ]],
        ])->assertCreated();
    }

    private function report(InventoryItem $item, int $days = 90): array
    {
        return $this->getJson("/api/inventory/{$item->id}/cost-usage?days={$days}")
            ->assertOk()
            ->json();
    }

    public function test_a_small_tin_can_beat_a_big_one_per_millilitre(): void
    {
        // 500 ml for MVR 95 is 0.19/ml. 100 ml for MVR 17 is 0.17/ml. Per tin
        // the big one looks better; per ml it is the more expensive ghee.
        $ghee = $this->ghee();
        $shop = $this->supplier('Fahi Store');

        $this->buy($ghee, $shop, 'Amul', $this->bigTin, 2, 95, now()->subDays(5)->toDateString());
        $this->buy($ghee, $shop, 'Milma', $this->smallTin, 6, 17, now()->subDays(3)->toDateString());

        $prices = collect($this->report($ghee)['prices']);
        $cheapest = $prices->firstWhere('is_cheapest', true);

        $this->assertSame('Milma', $cheapest['brand']);
        $this->assertSame('100 ml tin', $cheapest['pack_name']);
        $this->assertEqualsWithDelta(0.17, $cheapest['per_unit'], 0.000001);
        // The row still names the price of a whole tin, so it is recognisable
        // as the thing somebody carried in.
        $this->assertEqualsWithDelta(17.0, $cheapest['pack_price'], 0.01);
    }

    public function test_brands_are_ranked_against_each_other_not_averaged(): void
    {
        $ghee = $this->ghee();
        $shop = $this->supplier('Fahi Store');

        $this->buy($ghee, $shop, 'Amul', $this->bigTin, 1, 100, now()->subDays(9)->toDateString());
        $this->buy($ghee, $shop, 'Milma', $this->bigTin, 1, 80, now()->subDays(8)->toDateString());

        $prices = collect($this->report($ghee)['prices']);

        $this->assertSame(['Milma', 'Amul'], $prices->pluck('brand')->all());
        $this->assertEqualsWithDelta(0.16, $prices[0]['per_unit'], 0.000001);
        $this->assertEqualsWithDelta(0.20, $prices[1]['per_unit'], 0.000001);
    }

    public function test_the_same_brand_from_two_suppliers_is_two_rows(): void
    {
        // Which shop to walk to is a different decision from which brand to buy.
        $ghee = $this->ghee();
        $this->buy($ghee, $this->supplier('Fahi Store'), 'Amul', $this->bigTin, 1, 100, now()->subDays(4)->toDateString());
        $this->buy($ghee, $this->supplier('Agro Mart'), 'Amul', $this->bigTin, 1, 85, now()->subDays(2)->toDateString());

        $prices = collect($this->report($ghee)['prices']);

        $this->assertCount(2, $prices);
        $this->assertSame('Agro Mart', $prices[0]['supplier']);
        $this->assertTrue($prices[0]['is_cheapest']);
    }

    public function test_a_price_outside_the_window_is_left_out(): void
    {
        // A bargain from last year is not a price you can go and pay today.
        $ghee = $this->ghee();
        $shop = $this->supplier('Fahi Store');

        $this->buy($ghee, $shop, 'Amul', $this->bigTin, 1, 95, now()->subDays(5)->toDateString());
        // Written straight in: the purchase endpoint refuses a date more than
        // 90 days back, which is exactly why a year-old row can only get here
        // by having been recorded a year ago.
        $old = Purchase::create([
            'purchase_number' => 'OLD-1',
            'supplier_id' => $shop->id,
            'purchase_date' => now()->subDays(400)->toDateString(),
            'status' => 'received',
            'subtotal' => 40,
        ]);
        PurchaseItem::create([
            'purchase_id' => $old->id,
            'inventory_item_id' => $ghee->id,
            'quantity' => 500,
            'received_quantity' => 500,
            'unit_cost' => 0.08,
            'total_cost' => 40,
            'pack_name' => '500 ml tin',
            'pack_size' => 500,
            'pack_quantity' => 1,
            'brand' => 'Old Stock',
        ]);

        $brands = collect($this->report($ghee, 90)['prices'])->pluck('brand');

        $this->assertSame(['Amul'], $brands->all());
        // days=0 means all time, and then the old one is back.
        $this->assertContains('Old Stock', collect($this->report($ghee, 0)['prices'])->pluck('brand')->all());
    }

    public function test_a_shop_run_price_is_listed_with_no_pack_rather_than_a_guessed_one(): void
    {
        // The buying list records a price and a brand but never asks what
        // container it came in. Inventing one would put a made-up number
        // beside real ones.
        $ghee = $this->ghee();
        $shop = $this->supplier('Corner Shop');

        SupplierPriceHistory::create([
            'supplier_id' => $shop->id,
            'inventory_item_id' => $ghee->id,
            'purchase_id' => null,
            'unit_price' => 0.15,
            'unit' => 'ml',
            'brand' => 'Local',
            'recorded_at' => now()->subDays(2)->toDateString(),
        ]);

        $row = collect($this->report($ghee)['prices'])->firstWhere('brand', 'Local');

        $this->assertSame('buying_list', $row['source']);
        $this->assertNull($row['pack_name']);
        $this->assertNull($row['pack_price']);
        $this->assertEqualsWithDelta(0.15, $row['per_unit'], 0.000001);
    }

    public function test_a_purchase_is_not_counted_twice_through_its_price_history(): void
    {
        // A purchase writes to both tables. The purchase line is the fuller
        // record, so the history row it created must not appear again.
        $ghee = $this->ghee();
        $this->buy($ghee, $this->supplier('Fahi Store'), 'Amul', $this->bigTin, 1, 95, now()->subDays(3)->toDateString());

        $this->assertCount(1, $this->report($ghee)['prices']);
    }

    public function test_used_is_the_total_across_every_brand_and_size(): void
    {
        /*
         * The point of one item with many packs: 2 × 500 ml of one brand and
         * 6 × 100 ml of another is 1600 ml of ghee, and 900 ml used is 900 ml
         * used — no brand or tin size enters into it.
         */
        $ghee = $this->ghee();
        $shop = $this->supplier('Fahi Store');
        $this->buy($ghee, $shop, 'Amul', $this->bigTin, 2, 95, now()->subDays(6)->toDateString());
        $this->buy($ghee, $shop, 'Milma', $this->smallTin, 6, 17, now()->subDays(4)->toDateString());

        StockMovement::create([
            'inventory_item_id' => $ghee->id,
            'type' => 'sale',
            'quantity' => -900,
            'balance_after' => 700,
            'unit_cost' => 0.18,
        ]);

        $usage = $this->report($ghee)['usage'];

        $this->assertEqualsWithDelta(1600.0, $usage['received'], 0.001);
        $this->assertEqualsWithDelta(900.0, $usage['used'], 0.001);
        $this->assertSame('ml', $usage['unit']);
    }

    public function test_what_was_thrown_away_is_separate_from_what_was_used(): void
    {
        // "We wasted 400 ml" and "the count was 400 ml out" are different
        // facts, and only one of them is worth chasing.
        $ghee = $this->ghee();

        StockMovement::create([
            'inventory_item_id' => $ghee->id, 'type' => 'sale',
            'quantity' => -500, 'balance_after' => 1100, 'unit_cost' => 0.18,
        ]);
        StockMovement::create([
            'inventory_item_id' => $ghee->id, 'type' => 'adjustment',
            'quantity' => -400, 'balance_after' => 700, 'unit_cost' => 0.18,
            'notes' => 'Spilled',
        ]);
        StockMovement::create([
            'inventory_item_id' => $ghee->id, 'type' => 'adjustment',
            'quantity' => 50, 'balance_after' => 750, 'unit_cost' => 0.18,
            'notes' => 'Count correction',
        ]);

        $usage = $this->report($ghee)['usage'];

        $this->assertEqualsWithDelta(500.0, $usage['used'], 0.001);
        $this->assertEqualsWithDelta(400.0, $usage['written_off'], 0.001);
        $this->assertEqualsWithDelta(50.0, $usage['added_back'], 0.001);
    }

    public function test_a_return_nets_off_what_was_used(): void
    {
        $ghee = $this->ghee();

        StockMovement::create([
            'inventory_item_id' => $ghee->id, 'type' => 'sale',
            'quantity' => -500, 'balance_after' => 500, 'unit_cost' => 0.18,
        ]);
        StockMovement::create([
            'inventory_item_id' => $ghee->id, 'type' => 'refund',
            'quantity' => 120, 'balance_after' => 620, 'unit_cost' => 0.18,
        ]);

        $this->assertEqualsWithDelta(380.0, $this->report($ghee)['usage']['used'], 0.001);
    }

    public function test_the_average_price_spans_the_brands_that_were_bought(): void
    {
        // 2 × 500 ml at 95 = MVR 190 for 1000 ml; 6 × 100 ml at 17 = MVR 102
        // for 600 ml. MVR 292 over 1600 ml is 0.1825 per ml.
        $ghee = $this->ghee();
        $shop = $this->supplier('Fahi Store');
        $this->buy($ghee, $shop, 'Amul', $this->bigTin, 2, 95, now()->subDays(6)->toDateString());
        $this->buy($ghee, $shop, 'Milma', $this->smallTin, 6, 17, now()->subDays(4)->toDateString());

        $usage = $this->report($ghee)['usage'];

        $this->assertEqualsWithDelta(292.0, $usage['spend'], 0.01);
        $this->assertEqualsWithDelta(0.1825, $usage['average_price'], 0.000001);
    }

    public function test_an_item_nobody_has_bought_reports_nothing_rather_than_zero(): void
    {
        // A blank average is "we do not know", which is not the same claim as
        // "it is free".
        $ghee = $this->ghee();

        $report = $this->report($ghee);

        $this->assertSame([], $report['prices']);
        $this->assertNull($report['usage']['average_price']);
        $this->assertEqualsWithDelta(0.0, $report['usage']['used'], 0.001);
    }

    public function test_the_report_carries_the_items_packs_for_context(): void
    {
        $ghee = $this->ghee();

        $packs = collect($this->report($ghee)['item']['packs']);

        $this->assertSame(['100 ml tin', '500 ml tin'], $packs->pluck('name')->all());
    }

    public function test_it_needs_permission_to_read(): void
    {
        // Behind inventory.view, like the price history it replaces.
        $ghee = $this->ghee();
        $outsider = $this->makeStaff('staff');
        $outsider->revokePermission('inventory.view');
        $outsider->unsetRelation('permissions');
        Sanctum::actingAs($outsider, ['staff']);

        $this->getJson("/api/inventory/{$ghee->id}/cost-usage")->assertForbidden();
    }
}
