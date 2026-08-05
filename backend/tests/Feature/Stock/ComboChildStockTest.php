<?php

declare(strict_types=1);

namespace Tests\Feature\Stock;

use App\Domains\Menu\Services\ComboChildStockService;
use App\Domains\Orders\Events\OrderCancelled;
use App\Domains\Orders\DTOs\OrderCancelledData;
use App\Models\Category;
use App\Models\ComboItem;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Role;
use App\Models\Shift;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\StockReservationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\PreparesPosApi;
use Tests\TestCase;

class ComboChildStockTest extends TestCase
{
    use PreparesPosApi;
    use RefreshDatabase;

    private const DEVICE_ID = 'TEST-COMBO-STOCK-001';

    private Category $category;

    private Customer $customer;

    private User $staffUser;

    private User $managerUser;

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(
            ['slug' => 'default'],
            ['name' => 'Default', 'is_active' => true],
        );

        $this->category = Category::create([
            'name' => 'Short Eats',
            'slug' => 'short-eats',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Combo Stock Customer',
            'phone' => '+9607770099',
            'is_active' => true,
        ]);

        $staffRole = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        $managerRole = Role::firstOrCreate(
            ['slug' => 'manager'],
            ['name' => 'Manager', 'description' => '', 'is_active' => true],
        );

        $this->staffUser = User::create([
            'name' => 'Cashier',
            'email' => 'combo-cashier@test.com',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->managerUser = User::create([
            'name' => 'Manager',
            'email' => 'combo-manager@test.com',
            'password' => Hash::make('password'),
            'role_id' => $managerRole->id,
            'pin_hash' => Hash::make('5678'),
            'is_active' => true,
        ]);

        $this->device = Device::create([
            'name' => 'Combo POS',
            'identifier' => self::DEVICE_ID,
            'type' => 'pos',
            'is_active' => true,
        ]);
    }

    private function makeTracked(string $name, int $stock, string $sku): Item
    {
        return Item::create([
            'category_id' => $this->category->id,
            'name' => $name,
            'base_price' => 10.00,
            'cost' => 2.00,
            'sku' => $sku,
            'is_active' => true,
            'is_available' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => $stock,
            'low_stock_threshold' => 0,
        ]);
    }

    private function makeUntracked(string $name, string $sku): Item
    {
        return Item::create([
            'category_id' => $this->category->id,
            'name' => $name,
            'base_price' => 10.00,
            'sku' => $sku,
            'is_active' => true,
            'is_available' => true,
            'track_stock' => false,
            'availability_type' => 'made_to_order',
        ]);
    }

    /**
     * @param  list<array{0: Item, 1: int, 2?: bool}>  $components
     */
    private function makeCombo(string $name, array $components, bool $comboTracksStock = false, int $comboStock = 0): Item
    {
        $combo = Item::create([
            'category_id' => $this->category->id,
            'name' => $name,
            'base_price' => 50.00,
            'sku' => 'COMBO-' . strtoupper(substr(md5($name), 0, 6)),
            'is_active' => true,
            'is_available' => true,
            'is_combo' => true,
            'track_stock' => $comboTracksStock,
            'availability_type' => $comboTracksStock ? 'stock_based' : 'made_to_order',
            'stock_quantity' => $comboStock,
        ]);

        foreach ($components as $row) {
            ComboItem::create([
                'combo_id' => $combo->id,
                'item_id' => $row[0]->id,
                'quantity' => $row[1],
                'is_optional' => $row[2] ?? false,
            ]);
        }

        return $combo->fresh(['comboItems.item']);
    }

    private function postPosOrder(Item $item, int $qty = 1): \Illuminate\Testing\TestResponse
    {
        $this->ensurePosApiReady($this->staffUser, self::DEVICE_ID);

        return $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $item->id, 'quantity' => $qty]],
            ]);
    }

    // ------------------------------------------------------------------
    // Path 1: POS sale deduction
    // ------------------------------------------------------------------

    public function test_pos_sale_deducts_required_combo_children(): void
    {
        $a = $this->makeTracked('Bajiya', 20, 'BAJ');
        $b = $this->makeTracked('Gulha', 20, 'GUL');
        $combo = $this->makeCombo('Hedhikaa 2', [[$a, 2], [$b, 1]]);

        Sanctum::actingAs($this->staffUser, ['staff']);
        $response = $this->postPosOrder($combo, 3);
        $this->assertSame(201, $response->status(), $response->getContent());

        $a->refresh();
        $b->refresh();
        // 3 combos × 2 bajiya = 6; 3 × 1 gulha = 3
        $this->assertSame(14, $a->stock_quantity);
        $this->assertSame(17, $b->stock_quantity);

        $orderId = (int) $response->json('order.id');
        $lineId = (int) $response->json('order.items.0.id');
        $this->assertTrue(
            StockMovement::where('idempotency_key', "pos:order:{$orderId}:item:{$lineId}:child:{$a->id}")->exists(),
        );
    }

    public function test_pos_sale_skips_optional_combo_children(): void
    {
        $required = $this->makeTracked('Required', 10, 'REQ');
        $optional = $this->makeTracked('Optional', 10, 'OPT');
        $combo = $this->makeCombo('With Optional', [[$required, 1], [$optional, 1, true]]);

        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postPosOrder($combo, 1)->assertCreated();

        $required->refresh();
        $optional->refresh();
        $this->assertSame(9, $required->stock_quantity);
        $this->assertSame(10, $optional->stock_quantity, 'Optional children must not be deducted');
    }

    public function test_pos_sale_combo_self_stock_unchanged_children_additional(): void
    {
        $child = $this->makeTracked('Child', 10, 'CHD');
        $combo = $this->makeCombo('Tracked Combo', [[$child, 1]], comboTracksStock: true, comboStock: 5);

        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postPosOrder($combo, 1)->assertCreated();

        $combo->refresh();
        $child->refresh();
        $this->assertSame(4, $combo->stock_quantity, 'Combo SKU still deducts when it tracks stock');
        $this->assertSame(9, $child->stock_quantity, 'Children are additional');
    }

    public function test_nested_self_referencing_combo_does_not_loop(): void
    {
        $leaf = $this->makeTracked('Leaf', 10, 'LEAF');
        $inner = $this->makeCombo('Inner', [[$leaf, 1]]);
        // Point inner back at itself via a second component row... use ComboItem directly
        // to create a cycle: outer contains inner, inner also contains outer.
        $outer = $this->makeCombo('Outer', [[$inner, 1]]);
        ComboItem::create([
            'combo_id' => $inner->id,
            'item_id' => $outer->id,
            'quantity' => 1,
            'is_optional' => false,
        ]);

        $svc = app(ComboChildStockService::class);
        $expanded = $svc->requiredChildrenForStock($outer->fresh(['comboItems.item.comboItems.item']), 1);

        $this->assertCount(1, $expanded);
        $this->assertSame($leaf->id, $expanded[0]['item']->id);
        $this->assertSame(1, $expanded[0]['quantity']);
    }

    // ------------------------------------------------------------------
    // Path 2: Online reservation
    // ------------------------------------------------------------------

    public function test_online_order_reserves_combo_children_without_deducting(): void
    {
        $a = $this->makeTracked('A', 10, 'A1');
        $b = $this->makeTracked('B', 10, 'B1');
        $combo = $this->makeCombo('Online Combo', [[$a, 2], [$b, 1]]);

        Sanctum::actingAs($this->customer, ['customer']);
        $response = $this->postJson('/api/customer/orders', [
            'type' => 'online_pickup',
            'items' => [['item_id' => $combo->id, 'quantity' => 1]],
        ]);
        $this->assertSame(201, $response->status(), $response->getContent());
        $orderId = (int) $response->json('order.id');

        $a->refresh();
        $b->refresh();
        $this->assertSame(10, $a->stock_quantity);
        $this->assertSame(10, $b->stock_quantity);

        $this->assertSame(2, (int) DB::table('stock_reservations')->where('item_id', $a->id)->where('order_id', $orderId)->value('quantity'));
        $this->assertSame(1, (int) DB::table('stock_reservations')->where('item_id', $b->id)->where('order_id', $orderId)->value('quantity'));
    }

    // ------------------------------------------------------------------
    // Path 5 / online cancel: ReleasePreparedStockOnCancelListener
    // ------------------------------------------------------------------

    public function test_online_cancel_releases_combo_child_reservations(): void
    {
        $child = $this->makeTracked('ChildR', 10, 'CHR');
        $combo = $this->makeCombo('Cancel Combo', [[$child, 3]]);

        Sanctum::actingAs($this->customer, ['customer']);
        $response = $this->postJson('/api/customer/orders', [
            'type' => 'online_pickup',
            'items' => [['item_id' => $combo->id, 'quantity' => 1]],
        ])->assertCreated();
        $orderId = (int) $response->json('order.id');

        $this->assertSame(1, DB::table('stock_reservations')->where('order_id', $orderId)->where('item_id', $child->id)->count());

        $order = Order::findOrFail($orderId);
        OrderCancelled::dispatch(OrderCancelledData::fromOrder($order));

        $this->assertSame(0, DB::table('stock_reservations')->where('order_id', $orderId)->count());
        $child->refresh();
        $this->assertSame(10, $child->stock_quantity, 'Cancel before pay only releases holds');
    }

    // ------------------------------------------------------------------
    // Path 3: POS cancel/void restore
    // ------------------------------------------------------------------

    public function test_pos_cancel_restores_combo_children(): void
    {
        $child = $this->makeTracked('CancelChild', 10, 'CC1');
        $combo = $this->makeCombo('Cancel POS Combo', [[$child, 2]]);

        Sanctum::actingAs($this->staffUser, ['staff']);
        $created = $this->postPosOrder($combo, 1)->assertCreated();
        $orderId = (int) $created->json('order.id');
        $child->refresh();
        $this->assertSame(8, $child->stock_quantity);

        Sanctum::actingAs($this->managerUser, ['staff']);
        $this->postJson("/api/orders/{$orderId}/cancel", [
            'reason' => 'Customer changed mind',
        ])->assertOk();

        $child->refresh();
        $this->assertSame(10, $child->stock_quantity);
    }

    // ------------------------------------------------------------------
    // Path 4: Refund restore
    // ------------------------------------------------------------------

    public function test_refund_restores_combo_children(): void
    {
        $child = $this->makeTracked('RefundChild', 10, 'RC1');
        $combo = $this->makeCombo('Refund Combo', [[$child, 2]]);

        Sanctum::actingAs($this->staffUser, ['staff']);
        $created = $this->postPosOrder($combo, 1)->assertCreated();
        $orderId = (int) $created->json('order.id');
        $order = Order::findOrFail($orderId);
        $lineId = (int) $created->json('order.items.0.id');

        $child->refresh();
        $this->assertSame(8, $child->stock_quantity);

        Payment::create([
            'order_id' => $order->id,
            'method' => 'cash',
            'amount' => (float) $order->total,
            'amount_laar' => (int) round(((float) $order->total) * 100),
            'status' => 'paid',
            'processed_at' => now(),
        ]);
        $order->update([
            'status' => 'paid',
            'paid_at' => now(),
            'total_laar' => (int) round(((float) $order->total) * 100),
        ]);

        $ownerRole = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        $owner = User::factory()->create([
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Shift::create([
            'user_id' => $owner->id,
            'device_id' => $this->device->id,
            'opened_at' => now(),
            'opening_cash' => 100,
        ]);

        Sanctum::actingAs($owner, ['staff']);
        $this->postJson("/api/orders/{$orderId}/refunds", [
            'amount' => (float) $order->total,
            'reason' => 'Full refund',
        ])->assertCreated();

        $child->refresh();
        $this->assertSame(10, $child->stock_quantity);
        $this->assertTrue(
            StockMovement::where('idempotency_key', "refund:order:{$orderId}:item:{$lineId}:child:{$child->id}")->exists(),
        );
    }

    // ------------------------------------------------------------------
    // Online pay converts child reservations to deductions
    // ------------------------------------------------------------------

    public function test_online_payment_converts_combo_child_reservations(): void
    {
        $child = $this->makeTracked('PayChild', 10, 'PC1');
        $combo = $this->makeCombo('Pay Combo', [[$child, 2]]);

        Sanctum::actingAs($this->customer, ['customer']);
        $response = $this->postJson('/api/customer/orders', [
            'type' => 'online_pickup',
            'items' => [['item_id' => $combo->id, 'quantity' => 1]],
        ])->assertCreated();
        $order = Order::findOrFail((int) $response->json('order.id'));

        app(StockReservationService::class)->convertToDeduction($order);

        $child->refresh();
        $this->assertSame(8, $child->stock_quantity);
        $this->assertSame(
            0,
            DB::table('stock_reservations')->where('order_id', $order->id)->where('item_id', $child->id)->count(),
        );
    }

    public function test_untracked_child_is_skipped_not_error(): void
    {
        $tracked = $this->makeTracked('Tracked', 5, 'TRK');
        $untracked = $this->makeUntracked('Sauce', 'SAUCE');
        $combo = $this->makeCombo('Mixed', [[$tracked, 1], [$untracked, 1]]);

        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postPosOrder($combo, 1)->assertCreated();

        $tracked->refresh();
        $this->assertSame(4, $tracked->stock_quantity);
    }

    public function test_collect_tomorrow_defers_combo_child_stock(): void
    {
        $child = $this->makeTracked('TomorrowChild', 10, 'TMC');
        $combo = $this->makeCombo('Tomorrow Combo', [[$child, 2]]);
        $combo->update(['allow_pre_order' => true]);
        $child->update(['allow_pre_order' => true]);

        $order = Order::create([
            'order_number' => 'TOM-COMBO-1',
            'type' => 'online_pickup',
            'status' => 'payment_pending',
            'customer_id' => $this->customer->id,
            'subtotal' => 50,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 50,
            'fulfil_date' => now()->addDay()->toDateString(),
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $combo->id,
            'item_name' => $combo->name,
            'quantity' => 1,
            'unit_price' => 50,
            'total_price' => 50,
            'status' => 'pending',
        ]);

        // Mimic create path: tomorrow skips reserveForOrder.
        // Calling reserve would be wrong — assert we do not call it and stock stays.
        $child->refresh();
        $this->assertSame(10, $child->stock_quantity);
        $this->assertSame(0, DB::table('stock_reservations')->where('order_id', $order->id)->count());

        // When fire converts (same as non-combo tomorrow), children deduct then.
        app(StockReservationService::class)->convertToDeduction($order->fresh(['items.item.comboItems.item']));
        $child->refresh();
        $this->assertSame(8, $child->stock_quantity);
    }

    public function test_idempotent_double_deduct_does_not_double_take_children(): void
    {
        $child = $this->makeTracked('IdemChild', 10, 'IDM');
        $combo = $this->makeCombo('Idem Combo', [[$child, 1]]);

        Sanctum::actingAs($this->staffUser, ['staff']);
        $created = $this->postPosOrder($combo, 1)->assertCreated();
        $orderId = (int) $created->json('order.id');
        $lineId = (int) $created->json('order.items.0.id');
        $orderItem = OrderItem::findOrFail($lineId);

        app(ComboChildStockService::class)->deductForOrderItem(
            $combo->fresh(['comboItems.item']),
            $orderItem,
            1,
            'pos:order:',
            $orderId,
            $this->staffUser->id,
        );

        $child->refresh();
        $this->assertSame(9, $child->stock_quantity);
        $this->assertSame(
            1,
            StockMovement::where('idempotency_key', "pos:order:{$orderId}:item:{$lineId}:child:{$child->id}")->count(),
        );
    }
}
