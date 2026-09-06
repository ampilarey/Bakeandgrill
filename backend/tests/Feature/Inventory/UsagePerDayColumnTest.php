<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\StockMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * "Water: ~5 bottles a day."
 *
 * Owner, 2026-09-06: "adding a column in stock to know how frequently we need
 * this … this can be known by sale and item and quantity bought, each day."
 *
 * Exactly that, on the list itself: consumption from sale and waste movements
 * where recipes track it, and the buying rate as the honest fallback where
 * they do not — bottled water bought five a day IS used five a day, give or
 * take the shelf. Days-left falls out of stock ÷ rate.
 */
class UsagePerDayColumnTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
    }

    private function item(string $name, string $sku, float $stock): InventoryItem
    {
        return InventoryItem::create([
            'name' => $name, 'sku' => $sku, 'unit' => 'piece',
            'current_stock' => $stock, 'unit_cost' => 5, 'is_active' => true,
        ]);
    }

    private function move(InventoryItem $item, string $type, float $qty, int $daysAgo): void
    {
        StockMovement::create([
            'inventory_item_id' => $item->id,
            'type' => $type,
            'quantity' => $qty,
            'balance_after' => 0,
            'occurred_at' => now()->subDays($daysAgo),
        ]);
    }

    private function row(string $name): array
    {
        $rows = $this->getJson('/api/inventory')->assertOk()->json('items.data');

        return collect($rows)->firstWhere('name', $name);
    }

    public function test_consumption_movements_become_a_daily_rate(): void
    {
        // 150 bottles sold over the last 30 days → 5 a day, 3 days of stock.
        $water = $this->item('Water', 'WTR-1', 15);
        foreach ([2, 9, 16, 23, 28] as $daysAgo) {
            $this->move($water, 'sale', -30, $daysAgo);
        }

        $row = $this->row('Water');

        $this->assertEqualsWithDelta(5.0, (float) $row['usage_per_day'], 0.01);
        $this->assertSame('used', $row['usage_source']);
        $this->assertSame(3, $row['days_left']);
    }

    public function test_waste_counts_as_going_through_it_too(): void
    {
        // Spoiled milk still had to be bought again.
        $milk = $this->item('Milk', 'MLK-1', 30);
        $this->move($milk, 'sale', -45, 5);
        $this->move($milk, 'waste', -15, 10);

        $row = $this->row('Milk');

        $this->assertEqualsWithDelta(2.0, (float) $row['usage_per_day'], 0.01);
    }

    public function test_an_untracked_item_falls_back_to_how_fast_it_is_bought(): void
    {
        /*
         * Nothing deducts gas cylinders through a recipe, but three came in
         * this month — and what comes in goes out.
         */
        $gas = $this->item('Gas cylinder', 'GAS-1', 2);
        $this->move($gas, 'purchase', 3, 12);

        $row = $this->row('Gas cylinder');

        $this->assertEqualsWithDelta(0.0, (float) $row['usage_per_day'], 0.001);
        $this->assertEqualsWithDelta(0.1, (float) $row['bought_per_day'], 0.001);
        $this->assertSame('bought', $row['usage_source']);
        $this->assertSame(20, $row['days_left']);
    }

    public function test_tracked_consumption_beats_the_buying_rate(): void
    {
        // A big stock-up must not inflate the daily figure once real usage
        // is known: you bought 300 but used 60.
        $rice = $this->item('Rice', 'RICE-1', 240);
        $this->move($rice, 'purchase', 300, 20);
        $this->move($rice, 'sale', -60, 10);

        $row = $this->row('Rice');

        $this->assertEqualsWithDelta(2.0, (float) $row['usage_per_day'], 0.01);
        $this->assertSame('used', $row['usage_source']);
        $this->assertSame(120, $row['days_left']);
    }

    public function test_movements_older_than_the_window_do_not_count(): void
    {
        $flour = $this->item('Flour', 'FLR-1', 10);
        $this->move($flour, 'sale', -900, 45);

        $row = $this->row('Flour');

        $this->assertEqualsWithDelta(0.0, (float) $row['usage_per_day'], 0.001);
        $this->assertNull($row['usage_source']);
        $this->assertNull($row['days_left']);
    }
}
