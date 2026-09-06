<?php

declare(strict_types=1);

namespace Tests\Feature\Stock;

use App\Domains\Inventory\Services\InventoryDeductionService;
use App\Domains\Menu\Services\BundlePricingService;
use App\Domains\Menu\Services\ComboCompositionService;
use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Services\OrderCreationService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Trade\Services\TradeDispatchService;
use App\Http\Controllers\Api\KdsController;
use App\Models\Category;
use App\Models\ComboItem;
use App\Models\Customer;
use App\Models\Device;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\Modifier;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderItemModifier;
use App\Models\PlatterGroup;
use App\Models\PlatterGroupItem;
use App\Models\Recipe;
use App\Models\RecipeItem;
use App\Models\Role;
use App\Models\Shift;
use App\Models\StockMovement;
use App\Models\TradeAccount;
use App\Models\User;
use App\Models\Variant;
use App\Services\KitchenProductionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * Menu-item stock audit, 2026-09-07. Owner: "Fix all."
 *
 * One test per finding, in the order the audit listed them, so the file
 * reads as the audit did.
 */
class MenuStockAuditTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->owner = $this->makeOwner();
        $this->category = Category::create(['name' => 'Audit', 'slug' => 'audit-' . uniqid(), 'is_active' => true]);
        Sanctum::actingAs($this->owner, ['staff']);
    }

    // ── fixtures ─────────────────────────────────────────────────────────────

    private function ingredient(string $name, string $unit, float $stock): InventoryItem
    {
        return InventoryItem::create([
            'name' => $name, 'sku' => strtoupper(substr(md5($name), 0, 8)), 'unit' => $unit,
            'current_stock' => $stock, 'unit_cost' => 1, 'is_active' => true,
        ]);
    }

    private function dish(string $name, array $attrs = []): Item
    {
        return Item::create(array_merge([
            'category_id' => $this->category->id,
            'name' => $name,
            'base_price' => 10,
            'sku' => strtoupper(substr(md5($name . uniqid()), 0, 8)),
            'is_active' => true,
            'is_available' => true,
            'track_stock' => false,
            'availability_type' => 'made_to_order',
        ], $attrs));
    }

    private function recipe(Item $item, InventoryItem $inv, float $perUnit, string $consumedAt = 'sale'): Recipe
    {
        $recipe = Recipe::create(['item_id' => $item->id, 'yield_quantity' => 1, 'consumed_at' => $consumedAt, 'total_cost' => 0]);
        RecipeItem::create(['recipe_id' => $recipe->id, 'inventory_item_id' => $inv->id, 'quantity' => $perUnit]);

        return $recipe;
    }

    /** @param list<array{Item, int, bool?, Variant?}> $children */
    private function bundle(string $name, array $children, array $attrs = []): Item
    {
        $bundle = $this->dish($name, array_merge(['is_combo' => true, 'base_price' => 50], $attrs));
        foreach ($children as $row) {
            ComboItem::create([
                'combo_id' => $bundle->id,
                'item_id' => $row[0]->id,
                'quantity' => $row[1],
                'is_optional' => $row[2] ?? false,
                'variant_id' => isset($row[3]) ? $row[3]->id : null,
            ]);
        }

        return $bundle->fresh();
    }

    /** A staff takeaway order straight through the service — the POS path, deducting at creation. */
    private function posOrder(array $items, array $extra = []): Order
    {
        return app(OrderCreationService::class)->createFromPayload(array_merge([
            'type' => 'takeaway',
            'items' => $items,
            'print' => false,
        ], $extra), $this->owner);
    }

    private function paid(Order $order): void
    {
        event(new OrderPaid(OrderPaidData::fromOrder($order)));
    }

    // ── 1. bundles consume ingredients ───────────────────────────────────────

    public function test_a_bundles_required_children_consume_their_ingredients_and_a_refund_puts_them_back(): void
    {
        $flour = $this->ingredient('Flour', 'kg', 10);
        $bun = $this->dish('Bun');
        $this->recipe($bun, $flour, 0.2);
        $meal = $this->bundle('Burger Meal', [[$bun, 2]]);

        $order = $this->posOrder([['item_id' => $meal->id, 'quantity' => 3]]);
        $this->paid($order);

        // 3 meals × 2 buns × 0.2 kg
        $this->assertEqualsWithDelta(8.8, (float) $flour->fresh()->current_stock, 0.001);

        app(InventoryDeductionService::class)->restoreForOrder($order->fresh(), $this->owner->id, 1.0, 1);
        $this->assertEqualsWithDelta(10.0, (float) $flour->fresh()->current_stock, 0.001);

        // Nothing comes back a second time.
        app(InventoryDeductionService::class)->restoreForOrder($order->fresh(), $this->owner->id, 1.0, 1);
        $this->assertEqualsWithDelta(10.0, (float) $flour->fresh()->current_stock, 0.001);
    }

    public function test_a_bundle_is_sold_out_when_a_child_has_run_out_of_ingredients(): void
    {
        $flour = $this->ingredient('Flour', 'kg', 0.1);
        $bun = $this->dish('Bun');
        $recipe = $this->recipe($bun, $flour, 0.2);
        $recipe->update(['limits_availability' => true]);
        $meal = $this->bundle('Burger Meal', [[$bun, 1]]);

        try {
            $this->posOrder([['item_id' => $meal->id, 'quantity' => 1]]);
            $this->fail('expected 422');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertStringContainsString('ingredients', $e->getMessage());
        }
    }

    // ── 2. catering & wholesale ──────────────────────────────────────────────

    public function test_wholesale_dispatch_takes_ingredients_and_bundle_children_and_cancel_returns_them(): void
    {
        $flour = $this->ingredient('Flour', 'kg', 10);
        $bun = $this->dish('Bun', ['track_stock' => true, 'availability_type' => 'stock_based', 'stock_quantity' => 20, 'wholesale_price_laar' => 800]);
        $this->recipe($bun, $flour, 0.2);
        $box = $this->bundle('Bun Box', [[$bun, 4]], ['wholesale_price_laar' => 3000]);

        $customer = Customer::create([
            'name' => 'Island Mart', 'phone' => '+9607711001', 'is_active' => true,
            'credit_enabled' => true, 'credit_status' => 'active', 'credit_limit_laar' => 5_000_000, 'credit_balance_laar' => 0,
        ]);
        $account = TradeAccount::create([
            'customer_id' => $customer->id, 'shop_name' => 'Island Mart', 'contact_phone' => '+9607711001',
            'default_discount_bp' => 0, 'is_active' => true,
        ]);

        $delivery = app(TradeDispatchService::class)->dispatch($account, [['item_id' => $box->id, 'qty' => 2]], $this->owner, 'audit-dispatch-1');

        // 2 boxes × 4 buns: the buns' own count and their flour both went.
        $this->assertSame(12, (int) $bun->fresh()->stock_quantity);
        $this->assertEqualsWithDelta(8.4, (float) $flour->fresh()->current_stock, 0.001);

        app(TradeDispatchService::class)->cancel($delivery, $this->owner);
        $this->assertSame(20, (int) $bun->fresh()->stock_quantity);
        $this->assertEqualsWithDelta(10.0, (float) $flour->fresh()->current_stock, 0.001);
    }

    // ── 3 & 16. production consumes, sales do not, when the recipe says so ───

    public function test_a_recipe_consumed_at_production_is_taken_by_the_batch_and_not_by_the_sale(): void
    {
        $flour = $this->ingredient('Flour', 'kg', 10);
        $cake = $this->dish('Cake', ['track_stock' => true, 'availability_type' => 'stock_based', 'stock_quantity' => 5]);
        $this->recipe($cake, $flour, 0.5, Recipe::CONSUMED_AT_PRODUCTION);

        $order = $this->posOrder([['item_id' => $cake->id, 'quantity' => 2]]);
        $this->paid($order);
        $this->assertSame(3, (int) $cake->fresh()->stock_quantity, 'the finished count moves on sale');
        $this->assertEqualsWithDelta(10.0, (float) $flour->fresh()->current_stock, 0.001, 'the flour does not');

        $batch = app(KitchenProductionService::class)->createBatch($this->owner, [
            'production_type' => 'prepared_stock',
            'items' => [['item_id' => $cake->id, 'produced_qty' => 4]],
        ]);
        $this->assertEqualsWithDelta(8.0, (float) $flour->fresh()->current_stock, 0.001, '4 cakes × 0.5 kg at production');
        $this->assertSame(1, StockMovement::where('type', 'production')->where('inventory_item_id', $flour->id)->count());

        app(KitchenProductionService::class)->cancelBatch($batch, $this->owner, 'burnt');
        $this->assertEqualsWithDelta(10.0, (float) $flour->fresh()->current_stock, 0.001, 'a cancelled batch puts it back');
    }

    // ── 4. offline sync survives an oversold prepared item ───────────────────

    public function test_an_offline_sale_that_oversold_a_prepared_item_still_syncs_and_is_flagged(): void
    {
        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $staff = User::create([
            'name' => 'Till', 'email' => 'till-audit@test.local', 'password' => Hash::make('password'),
            'role_id' => $staffRole->id, 'pin_hash' => Hash::make('1234'), 'is_active' => true,
        ]);
        $device = Device::create(['name' => 'Offline POS', 'identifier' => 'AUDIT-OFFLINE-1', 'type' => 'pos', 'is_active' => true]);
        $bottle = $this->dish('Water', ['base_price' => 5, 'track_stock' => true, 'availability_type' => 'stock_based', 'stock_quantity' => 10]);

        Sanctum::actingAs($staff, ['staff']);
        $shiftId = (int) $this->withHeader('X-Device-Identifier', $device->identifier)
            ->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated()->json('shift.id');
        Shift::findOrFail($shiftId);

        $reference = $this->withHeader('X-Device-Identifier', $device->identifier)
            ->postJson('/api/orders', ['type' => 'takeaway', 'items' => [['item_id' => $bottle->id, 'quantity' => 1]]])
            ->assertCreated()->json('order');

        // The shelf emptied while the till was offline.
        $bottle->update(['stock_quantity' => 0]);

        $key = (string) \Illuminate\Support\Str::uuid();
        $response = $this->withHeader('X-Device-Identifier', $device->identifier)->postJson('/api/pos/offline-sync', ['orders' => [[
            'idempotency_key' => $key,
            'local_order_id' => $key,
            'local_order_number' => 'OFF-AUDIT-0001',
            'device_identifier' => $device->identifier,
            'shift_id' => $shiftId,
            'created_at_local' => now()->toIso8601String(),
            'type' => 'takeaway',
            'items' => [['item_id' => $bottle->id, 'quantity' => 1, 'unit_price' => 5.0]],
            'totals' => ['subtotal' => (float) $reference['subtotal'], 'tax' => (float) $reference['tax_amount'], 'total' => (float) $reference['total']],
            'payment' => ['method' => 'cash', 'amount' => (float) $reference['total']],
        ]]]);

        $response->assertOk()
            ->assertJsonPath('results.0.status', 'synced')
            ->assertJsonPath('results.0.inventory_conflict', true);
        $this->assertSame(-1, (int) $bottle->fresh()->stock_quantity, 'the count says what happened rather than hiding the sale');
    }

    // ── 5. tomorrow orders take ingredients at fire ──────────────────────────

    public function test_a_collect_tomorrow_order_takes_its_ingredients_when_fired_not_when_paid(): void
    {
        $flour = $this->ingredient('Flour', 'kg', 10);
        $bun = $this->dish('Bun');
        $this->recipe($bun, $flour, 0.5);

        $order = Order::factory()->paid()->create(['customer_id' => $this->makeCustomer()->id, 'fulfil_date' => now()->addDay()->toDateString()]);
        OrderItem::create(['order_id' => $order->id, 'item_id' => $bun->id, 'item_name' => 'Bun', 'quantity' => 2, 'unit_price' => 10, 'total_price' => 20]);

        $this->paid($order);
        $this->assertEqualsWithDelta(10.0, (float) $flour->fresh()->current_stock, 0.001, 'payment day leaves the pool alone');

        // What fire-to-kitchen does on the collection day.
        app(InventoryDeductionService::class)->deductForOrder($order->fresh());
        $this->assertEqualsWithDelta(9.0, (float) $flour->fresh()->current_stock, 0.001);
    }

    // ── 6. sized children ────────────────────────────────────────────────────

    public function test_a_sized_child_moves_its_size_stock_prices_at_its_size_and_prints_its_size(): void
    {
        $coke = $this->dish('Coke', ['has_variants' => true, 'base_price' => 0]);
        $small = $coke->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true, 'track_stock' => true, 'stock_qty' => 5, 'sort_order' => 0]);
        $large = $coke->variants()->create(['name' => 'Large', 'price' => 15, 'is_active' => true, 'track_stock' => true, 'stock_qty' => 5, 'sort_order' => 1]);
        $bun = $this->dish('Bun', ['base_price' => 20]);
        $meal = $this->bundle('Combo', [[$bun, 1], [$coke, 1, false, $large]], ['combo_discount_pct' => 10]);

        // Priced at the Large, not at the cheapest size: (20 + 15) less 10%.
        $this->assertEqualsWithDelta(31.5, app(BundlePricingService::class)->bundlePrice($meal->fresh(['comboItems.item.variants', 'comboItems.variant'])), 0.001);

        $order = $this->posOrder([['item_id' => $meal->id, 'quantity' => 2]]);
        $this->assertSame(3, (int) $large->fresh()->stock_qty, 'the Large count moved');
        $this->assertSame(5, (int) $small->fresh()->stock_qty, 'the Small did not');

        $kitchen = KdsController::formatKitchenOrder($order->fresh());
        $this->assertSame('Coke (Large)', $kitchen['items'][0]['bundle_contents'][1]['name'] ?? $kitchen['items'][0]['bundle_contents'][0]['name']);
    }

    public function test_a_platter_pick_can_name_a_size(): void
    {
        $tea = $this->dish('Tea', ['has_variants' => true, 'base_price' => 0]);
        $large = $tea->variants()->create(['name' => 'Large', 'price' => 15, 'is_active' => true, 'track_stock' => true, 'stock_qty' => 5, 'sort_order' => 0]);
        $platter = $this->dish('Tea Set', ['is_combo' => true, 'base_price' => 40]);
        $group = PlatterGroup::create(['item_id' => $platter->id, 'name' => 'Drink', 'rule_type' => 'exactly', 'min_count' => 1, 'max_count' => 1, 'sort_order' => 0]);
        PlatterGroupItem::create(['platter_group_id' => $group->id, 'item_id' => $tea->id, 'variant_id' => $large->id, 'surcharge' => 0, 'sort_order' => 0]);

        $order = $this->posOrder([['item_id' => $platter->id, 'quantity' => 1, 'children' => [['item_id' => $tea->id, 'quantity' => 1, 'group_id' => $group->id]]]]);

        $child = $order->items()->whereNotNull('parent_order_item_id')->first();
        $this->assertSame($large->id, (int) $child->variant_id);
        $this->assertSame('Large', $child->variant_name);
        $this->assertSame(4, (int) $large->fresh()->stock_qty);
    }

    // ── 7 & 15. what may go inside a bundle ──────────────────────────────────

    public function test_composition_refuses_a_sized_child_without_a_size_and_a_platter_inside_a_bundle(): void
    {
        $coke = $this->dish('Coke', ['has_variants' => true, 'base_price' => 0]);
        $coke->variants()->create(['name' => 'Small', 'price' => 10, 'is_active' => true, 'sort_order' => 0]);
        $coke->variants()->create(['name' => 'Large', 'price' => 15, 'is_active' => true, 'sort_order' => 1]);
        $platter = $this->dish('Mixed Platter', ['is_combo' => true]);
        PlatterGroup::create(['item_id' => $platter->id, 'name' => 'Pick', 'rule_type' => 'exactly', 'min_count' => 2, 'max_count' => 2, 'sort_order' => 0]);
        $bundle = $this->dish('Bundle', ['is_combo' => true]);

        try {
            app(ComboCompositionService::class)->sync($bundle, [['item_id' => $coke->id, 'quantity' => 1]]);
            $this->fail('expected a size to be required');
        } catch (\InvalidArgumentException $e) {
            $this->assertStringContainsString('comes in sizes', $e->getMessage());
        }

        try {
            app(ComboCompositionService::class)->sync($bundle, [['item_id' => $platter->id, 'quantity' => 1]]);
            $this->fail('expected a platter to be refused');
        } catch (\InvalidArgumentException $e) {
            $this->assertStringContainsString('build-your-own platter', $e->getMessage());
        }
    }

    public function test_an_item_inside_a_bundle_cannot_be_deleted(): void
    {
        $bun = $this->dish('Bun');
        $this->bundle('Burger Meal', [[$bun, 1]]);

        $this->deleteJson("/api/items/{$bun->id}")
            ->assertStatus(422)
            ->assertJsonPath('used_in.0', 'Burger Meal');
        $this->assertNotNull(Item::find($bun->id));
    }

    // ── 9. stock edits leave a movement ──────────────────────────────────────

    public function test_a_count_typed_into_the_item_editor_writes_a_movement(): void
    {
        $bottle = $this->dish('Water', ['track_stock' => true, 'availability_type' => 'stock_based', 'stock_quantity' => 10]);

        $this->patchJson("/api/items/{$bottle->id}", ['stock_quantity' => 25])->assertOk();

        $move = StockMovement::where('reference_type', 'menu_item')->where('reference_id', $bottle->id)->where('type', 'adjustment')->first();
        $this->assertNotNull($move);
        $this->assertEqualsWithDelta(15.0, (float) $move->quantity, 0.001);
        $this->assertEqualsWithDelta(25.0, (float) $move->balance_after, 0.001);
    }

    // ── 10. "86 today" counts for a pick ─────────────────────────────────────

    public function test_a_snoozed_dish_cannot_be_picked_onto_a_platter(): void
    {
        $bajiya = $this->dish('Bajiya', ['snoozed_until' => now()->addHours(3)]);
        $platter = $this->dish('Short Eats Platter', ['is_combo' => true, 'base_price' => 40]);
        $group = PlatterGroup::create(['item_id' => $platter->id, 'name' => 'Pick', 'rule_type' => 'exactly', 'min_count' => 1, 'max_count' => 1, 'sort_order' => 0]);
        PlatterGroupItem::create(['platter_group_id' => $group->id, 'item_id' => $bajiya->id, 'surcharge' => 0, 'sort_order' => 0]);

        try {
            $this->posOrder([['item_id' => $platter->id, 'quantity' => 1, 'children' => [['item_id' => $bajiya->id, 'quantity' => 1, 'group_id' => $group->id]]]]);
            $this->fail('expected 422');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertStringContainsString('unavailable', $e->getMessage());
        }
    }

    // ── 11. modifiers ────────────────────────────────────────────────────────

    public function test_a_modifier_with_an_ingredient_consumes_it(): void
    {
        $cheese = $this->ingredient('Cheese', 'g', 1000);
        $extra = Modifier::create(['name' => 'Extra cheese', 'price' => 5, 'is_active' => true, 'inventory_item_id' => $cheese->id, 'ingredient_quantity' => 20, 'ingredient_unit' => 'g']);
        $burger = $this->dish('Burger');

        $order = Order::factory()->paid()->create(['customer_id' => $this->makeCustomer()->id]);
        $line = OrderItem::create(['order_id' => $order->id, 'item_id' => $burger->id, 'item_name' => 'Burger', 'quantity' => 2, 'unit_price' => 10, 'total_price' => 30]);
        OrderItemModifier::create(['order_item_id' => $line->id, 'modifier_id' => $extra->id, 'modifier_name' => 'Extra cheese', 'modifier_price' => 5, 'quantity' => 1]);

        $this->paid($order);
        $this->assertEqualsWithDelta(960.0, (float) $cheese->fresh()->current_stock, 0.001, '2 burgers × 20 g');

        app(InventoryDeductionService::class)->restoreForOrder($order->fresh(), null, 0.5, 7);
        $this->assertEqualsWithDelta(980.0, (float) $cheese->fresh()->current_stock, 0.001, 'half back on a half refund');
    }

    public function test_the_modifier_endpoint_stores_the_ingredient_link(): void
    {
        $cheese = $this->ingredient('Cheese', 'g', 1000);

        $id = (int) $this->postJson('/api/modifiers', [
            'name' => 'Extra cheese', 'price' => 5, 'inventory_item_id' => $cheese->id, 'ingredient_quantity' => 20, 'ingredient_unit' => 'g',
        ])->assertCreated()->json('modifier.id');

        $this->getJson('/api/modifiers')->assertOk()
            ->assertJsonPath('modifiers.0.inventory_item.name', 'Cheese')
            ->assertJsonPath('modifiers.0.ingredient_quantity', 20);

        // Drop the ingredient again: both fields clear together.
        $this->patchJson("/api/modifiers/{$id}", ['inventory_item_id' => null])->assertOk()
            ->assertJsonPath('modifier.inventory_item_id', null)
            ->assertJsonPath('modifier.ingredient_quantity', null);
    }

    // ── 12. whole units ──────────────────────────────────────────────────────

    public function test_a_prepared_count_line_must_be_a_whole_number(): void
    {
        $bottle = $this->dish('Water', ['track_stock' => true, 'availability_type' => 'stock_based', 'stock_quantity' => 10]);

        try {
            $this->posOrder([['item_id' => $bottle->id, 'quantity' => 1.5]]);
            $this->fail('expected 422');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertStringContainsString('whole units', $e->getMessage());
        }
        $this->assertSame(10, (int) $bottle->fresh()->stock_quantity);
    }

    // ── 13. void puts back only what was taken ───────────────────────────────

    public function test_void_puts_back_only_what_was_actually_taken(): void
    {
        $bottle = $this->dish('Water', ['track_stock' => true, 'availability_type' => 'stock_based', 'stock_quantity' => 10]);
        $order = $this->posOrder([['item_id' => $bottle->id, 'quantity' => 2]]);
        $this->assertSame(8, (int) $bottle->fresh()->stock_quantity);

        // Pretend the deduction never happened (as for a ticket whose stock
        // is deferred): no sale movement, count untouched.
        StockMovement::where('idempotency_key', 'like', 'pos:order:' . $order->id . ':%')->delete();
        Item::whereKey($bottle->id)->update(['stock_quantity' => 10]);

        $this->postJson("/api/orders/{$order->id}/cancel", ['reason' => 'test'])->assertOk();
        $this->assertSame(10, (int) $bottle->fresh()->stock_quantity, 'nothing was taken, so nothing comes back');
    }
}
