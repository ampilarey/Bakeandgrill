<?php

declare(strict_types=1);

namespace Tests\Feature\Reports;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Recipe;
use App\Models\RecipeItem;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use App\Models\WasteLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-09-21, phase C: what each dish makes us and what we throw
 * away of it, with the recipe cost, the purchase prices and the waste log
 * finally in one table.
 */
class MarginWasteReportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    private function sell(Item $item, int $qty, float $price, string $status = 'completed'): void
    {
        $order = Order::factory()->create(['status' => $status, 'type' => 'takeaway', 'total' => $qty * $price, 'total_laar' => (int) round($qty * $price * 100)]);
        OrderItem::create([
            'order_id' => $order->id, 'item_id' => $item->id, 'item_name' => $item->name,
            'quantity' => $qty, 'unit_price' => $price, 'total_price' => $qty * $price,
        ]);
    }

    public function test_it_joins_sales_recipe_cost_price_movement_and_waste_per_dish(): void
    {
        $cat = $this->makeCategory();
        $flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'current_stock' => 50, 'unit_cost' => 12, 'is_active' => true]);
        $egg = InventoryItem::create(['name' => 'Egg', 'unit' => 'pcs', 'current_stock' => 100, 'unit_cost' => 2, 'is_active' => true]);
        $agora = Supplier::create(['name' => 'Agora']);
        // Flour went from 10 to 12 over the month; eggs stayed.
        SupplierPriceHistory::create(['supplier_id' => $agora->id, 'inventory_item_id' => $flour->id, 'unit_price' => 10, 'unit' => 'kg', 'recorded_at' => now()->subDays(40)->toDateString()]);
        SupplierPriceHistory::create(['supplier_id' => $agora->id, 'inventory_item_id' => $flour->id, 'unit_price' => 12, 'unit' => 'kg', 'recorded_at' => now()->subDays(2)->toDateString()]);
        SupplierPriceHistory::create(['supplier_id' => $agora->id, 'inventory_item_id' => $egg->id, 'unit_price' => 2, 'unit' => 'pcs', 'recorded_at' => now()->subDays(40)->toDateString()]);
        SupplierPriceHistory::create(['supplier_id' => $agora->id, 'inventory_item_id' => $egg->id, 'unit_price' => 2, 'unit' => 'pcs', 'recorded_at' => now()->subDays(2)->toDateString()]);

        // Bajiya: 0.1 kg flour (1.20) + 1 egg (2.00) = 3.20 to make, sells at 5.
        $bajiya = $this->makeItem(false, 0, ['name' => 'Bajiya', 'category_id' => $cat->id, 'base_price' => 5, 'cost' => 0]);
        $recipe = Recipe::create(['item_id' => $bajiya->id, 'yield_quantity' => 1, 'limits_availability' => false, 'total_cost' => 0]);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $flour->id, 'quantity' => 0.1, 'unit' => 'kg']);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $egg->id, 'quantity' => 1, 'unit' => 'pcs']);
        // Tea: no recipe, a typed cost of 1, sells at 10.
        $tea = $this->makeItem(false, 0, ['name' => 'Tea', 'category_id' => $cat->id, 'base_price' => 10, 'cost' => 1]);
        // Something with no cost at all.
        $mystery = $this->makeItem(false, 0, ['name' => 'Mystery', 'category_id' => $cat->id, 'base_price' => 8, 'cost' => 0]);

        $this->sell($bajiya, 100, 5);
        $this->sell($bajiya, 20, 5, 'cancelled');   // not a sale
        $this->sell($tea, 10, 10);
        $this->sell($mystery, 3, 8);
        WasteLog::create(['item_id' => $bajiya->id, 'quantity' => 12, 'unit' => 'pcs', 'cost_estimate' => 38.4, 'reason' => 'expired']);
        WasteLog::create(['inventory_item_id' => $flour->id, 'quantity' => 2, 'unit' => 'kg', 'cost_estimate' => 24, 'reason' => 'spoilage']);

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $res = $this->getJson('/api/reports/margin-waste?from=' . now()->subDays(7)->toDateString() . '&to=' . now()->toDateString())->assertOk();

        $rows = collect($res->json('rows'))->keyBy('name');
        $b = $rows['Bajiya'];
        $this->assertEquals(100, $b['units']);
        $this->assertEquals(500, $b['revenue']);
        $this->assertEquals(3.2, $b['unit_cost']);
        $this->assertEquals(320, $b['cost']);
        $this->assertEquals(180, $b['profit']);
        $this->assertEquals(36.0, $b['margin_pct']);
        // Flour is 1.20 of the 3.20 and rose 20%: the recipe cost was 3.00 a month ago, +6.7%.
        $this->assertEquals(6.7, $b['cost_change_pct']);
        $this->assertEquals(12, $b['waste_qty']);
        $this->assertEquals(38.4, $b['waste_cost']);
        $this->assertEquals(12.0, $b['waste_pct']);
        $this->assertSame(['high_waste'], $b['flags']);

        $t = $rows['Tea'];
        $this->assertEquals(90.0, $t['margin_pct']);
        $this->assertNull($t['cost_change_pct']);
        $this->assertSame([], $t['flags']);

        $m = $rows['Mystery'];
        $this->assertNull($m['cost']);
        $this->assertNull($m['margin_pct']);

        $s = $res->json('summary');
        $this->assertEquals(624, $s['revenue']);
        $this->assertEquals(330, $s['cost']);            // 320 + 10
        $this->assertEquals(270, $s['profit']);          // 600 costed revenue − 330
        $this->assertEquals(45.0, $s['margin_pct']);
        $this->assertEquals(38.4, $s['dish_waste_cost']);
        $this->assertEquals(24, $s['ingredient_waste_cost']);
        $this->assertSame(1, $s['high_waste']);
        $this->assertSame(0, $s['low_margin']);
        $this->assertSame(3, $s['dishes']);
    }

    public function test_it_needs_the_reports_permission(): void
    {
        Sanctum::actingAs($this->makeKitchenStaff(), ['staff']);
        $this->getJson('/api/reports/margin-waste')->assertForbidden();
    }
}
