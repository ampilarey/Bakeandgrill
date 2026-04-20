<?php

declare(strict_types=1);

namespace Tests\Feature\Stock;

use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Recipe;
use App\Models\RecipeItem;
use App\Models\StockMovement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Tests that the DeductInventoryListener correctly reduces ingredient stock
 * when an OrderPaid event is fired.
 *
 * All tests fire the event directly (no HTTP call needed) to keep tests fast
 * and independent of the payment controller.
 */
class InventoryDeductionTest extends TestCase
{
    use RefreshDatabase;

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function makeInventoryItem(float $stock = 100): InventoryItem
    {
        return InventoryItem::create([
            'name'          => 'Ingredient ' . uniqid(),
            'unit'          => 'kg',
            'current_stock' => $stock,
            'is_active'     => true,
        ]);
    }

    private function makeItemWithRecipe(InventoryItem $inventoryItem, float $quantityPerUnit = 0.5): \App\Models\Item
    {
        $category = $this->makeCategory();
        $item = $this->makeItem(false, 0, ['category_id' => $category->id]);

        $recipe = Recipe::create([
            'item_id'          => $item->id,
            'yield_quantity'   => 1,
            'instructions'     => null,
            'total_cost'       => 0,
        ]);

        RecipeItem::create([
            'recipe_id'          => $recipe->id,
            'inventory_item_id'  => $inventoryItem->id,
            'quantity'           => $quantityPerUnit,
        ]);

        return $item;
    }

    private function makeInventoryOrder(\App\Models\Item $item, int $qty = 2): Order
    {
        $customer = $this->makeCustomer();
        $order = Order::factory()->paid()->create(['customer_id' => $customer->id, 'total' => $item->base_price * $qty]);

        OrderItem::create([
            'order_id'    => $order->id,
            'item_id'     => $item->id,
            'item_name'   => $item->name,
            'quantity'    => $qty,
            'unit_price'  => $item->base_price,
            'total_price' => $item->base_price * $qty,
        ]);

        return $order;
    }

    private function fireOrderPaid(Order $order): void
    {
        event(new OrderPaid(OrderPaidData::fromOrder($order)));
    }

    // ── Test cases ────────────────────────────────────────────────────────────

    public function test_inventory_deducted_when_item_has_recipe(): void
    {
        $inventoryItem = $this->makeInventoryItem(100);
        $menuItem      = $this->makeItemWithRecipe($inventoryItem, quantityPerUnit: 0.5);
        $order         = $this->makeInventoryOrder($menuItem, qty: 2);

        $this->fireOrderPaid($order);

        // 2 units × 0.5 kg/unit = 1.0 kg deducted
        $inventoryItem->refresh();
        $this->assertEqualsWithDelta(99.0, (float) $inventoryItem->current_stock, 0.001);
    }

    public function test_no_deduction_when_item_has_no_recipe(): void
    {
        $inventoryItem = $this->makeInventoryItem(100);
        $item          = $this->makeItem(false); // no recipe
        $customer      = $this->makeCustomer();
        $order = Order::factory()->paid()->create(['customer_id' => $customer->id, 'total' => 10.00]);
        OrderItem::create([
            'order_id' => $order->id, 'item_id' => $item->id,
            'item_name' => $item->name, 'quantity' => 3,
            'unit_price' => 3.33, 'total_price' => 10.00,
        ]);

        $this->fireOrderPaid($order);

        $inventoryItem->refresh();
        $this->assertEquals(100, (float) $inventoryItem->current_stock);
    }

    public function test_deduction_is_idempotent(): void
    {
        $inventoryItem = $this->makeInventoryItem(100);
        $menuItem      = $this->makeItemWithRecipe($inventoryItem, 1.0);
        $order         = $this->makeInventoryOrder($menuItem, 1);

        // Fire twice — second run must be a no-op
        $this->fireOrderPaid($order);
        $this->fireOrderPaid($order);

        $inventoryItem->refresh();
        $this->assertEqualsWithDelta(99.0, (float) $inventoryItem->current_stock, 0.001);

        // Only one StockMovement should exist
        $movements = StockMovement::where('reference_id', $order->id)
            ->where('reference_type', 'order')
            ->get();
        $this->assertCount(1, $movements);
    }

    public function test_multiple_items_with_same_ingredient_are_each_deducted(): void
    {
        $inventoryItem = $this->makeInventoryItem(100);
        $menuItem1     = $this->makeItemWithRecipe($inventoryItem, 0.5);
        $menuItem2     = $this->makeItemWithRecipe($inventoryItem, 0.5);

        $customer = $this->makeCustomer();
        $order    = Order::factory()->paid()->create(['customer_id' => $customer->id, 'total' => 20.00]);
        OrderItem::create([
            'order_id' => $order->id, 'item_id' => $menuItem1->id,
            'item_name' => $menuItem1->name, 'quantity' => 1,
            'unit_price' => 10.00, 'total_price' => 10.00,
        ]);
        OrderItem::create([
            'order_id' => $order->id, 'item_id' => $menuItem2->id,
            'item_name' => $menuItem2->name, 'quantity' => 1,
            'unit_price' => 10.00, 'total_price' => 10.00,
        ]);

        $this->fireOrderPaid($order);

        // 1 × 0.5 + 1 × 0.5 = 1.0 total deducted
        $inventoryItem->refresh();
        $this->assertEqualsWithDelta(99.0, (float) $inventoryItem->current_stock, 0.001);
    }

    public function test_stock_movement_record_is_created(): void
    {
        $inventoryItem = $this->makeInventoryItem(50);
        $menuItem      = $this->makeItemWithRecipe($inventoryItem, 2.0);
        $order         = $this->makeInventoryOrder($menuItem, 1);

        $this->fireOrderPaid($order);

        $this->assertDatabaseHas('stock_movements', [
            'inventory_item_id' => $inventoryItem->id,
        ]);
    }
}
