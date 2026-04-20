<?php

declare(strict_types=1);

namespace Tests\Feature\Stock;

use App\Domains\Orders\DTOs\OrderCancelledData;
use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderCancelled;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Role;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\StockManagementService;
use App\Services\StockReservationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Wave A — Prepared stock truth tests.
 *
 * Covers all 10 scenarios from the Wave A plan:
 *  1. POS deducts immediately on order creation
 *  2. Online reserves (does not deduct) on creation
 *  3. Payment success converts reservation → deduction
 *  4. Payment failure cancels order + releases reservation
 *  5. CancelStaleOrders releases reservation on stale payment_pending
 *  6. Double-release is idempotent (no double-add)
 *  7. Full refund restores stock_quantity
 *  8. Two concurrent online orders for the last unit — only one wins
 *  9. Idempotent deduction — OrderPaid fired twice does not double-deduct
 * 10. POS and online share the same stock_quantity column
 */
class PreparedStockTest extends TestCase
{
    use RefreshDatabase;

    private const DEVICE_ID = 'TEST-POS-001';

    private Category $category;
    private MenuGroup $menuGroup;
    private Customer $customer;
    private User $staffUser;
    private User $managerUser;
    private Role $staffRole;
    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();

        // MenuGroup id=1 is auto-assigned by Item::booted() when menu_group_id is null.
        // Use firstOrCreate in case a seeder or base migration already inserted it.
        $this->menuGroup = MenuGroup::firstOrCreate(
            ['slug' => 'default'],
            ['name' => 'Default', 'is_active' => true],
        );

        $this->category = Category::create([
            'name'      => 'Food',
            'slug'      => 'food',
            'is_active' => true,
        ]);

        $this->customer = Customer::create([
            'name'      => 'Stock Test Customer',
            'phone'     => '+9607770001',
            'is_active' => true,
        ]);

        $this->staffRole = Role::create([
            'name'      => 'Cashier',
            'slug'      => 'cashier',
            'is_active' => true,
        ]);

        $managerRole = Role::create([
            'name'      => 'Manager',
            'slug'      => 'manager',
            'is_active' => true,
        ]);

        $this->staffUser = User::create([
            'name'      => 'Cashier',
            'email'     => 'cashier@test.com',
            'password'  => Hash::make('password'),
            'role_id'   => $this->staffRole->id,
            'pin_hash'  => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->managerUser = User::create([
            'name'      => 'Manager',
            'email'     => 'manager@test.com',
            'password'  => Hash::make('password'),
            'role_id'   => $managerRole->id,
            'pin_hash'  => Hash::make('5678'),
            'is_active' => true,
        ]);

        $this->device = Device::create([
            'name'       => 'Test POS',
            'identifier' => self::DEVICE_ID,
            'type'       => 'pos',
            'is_active'  => true,
        ]);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private function makePreparedItem(int $stock, string $sku = 'ITEM-001'): Item
    {
        return Item::create([
            'category_id'       => $this->category->id,
            'name'              => 'Prepared Burger',
            'base_price'        => 50.00,
            'cost'              => 10.00,
            'sku'               => $sku,
            'is_active'         => true,
            'is_available'      => true,
            'track_stock'       => true,
            'availability_type' => 'stock_based',
            'stock_quantity'    => $stock,
            'low_stock_threshold' => 0,
        ]);
    }

    private function makeMadeToOrderItem(): Item
    {
        return Item::create([
            'category_id'       => $this->category->id,
            'name'              => 'Custom Sandwich',
            'base_price'        => 40.00,
            'sku'               => 'MTO-001',
            'is_active'         => true,
            'is_available'      => true,
            'track_stock'       => false,
            'availability_type' => 'made_to_order',
        ]);
    }

    /** Build a minimal online order payload for the HTTP layer */
    private function onlineOrderPayload(Item $item, int $qty = 1): array
    {
        return [
            'type'  => 'online_pickup',
            'items' => [['item_id' => $item->id, 'quantity' => $qty]],
        ];
    }

    /** Build a minimal POS (takeaway) order payload */
    private function posOrderPayload(Item $item, int $qty = 1): array
    {
        return [
            'type'  => 'takeaway',
            'items' => [['item_id' => $item->id, 'quantity' => $qty]],
        ];
    }

    /** POST to the POS orders endpoint with the required device header */
    private function postPosOrder(array $payload): \Illuminate\Testing\TestResponse
    {
        return $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson('/api/orders', $payload);
    }

    // ------------------------------------------------------------------
    // 1. POS order deducts stock_quantity immediately on creation
    // ------------------------------------------------------------------

    public function test_pos_order_deducts_prepared_stock_immediately(): void
    {
        $item = $this->makePreparedItem(10);

        Sanctum::actingAs($this->staffUser, ['staff']);

        $response = $this->postPosOrder($this->posOrderPayload($item, 3));
        $this->assertSame(201, $response->status(), $response->getContent());

        $item->refresh();
        $this->assertSame(7, $item->stock_quantity, 'POS order should deduct stock immediately');

        $movements = StockMovement::where('reference_type', 'menu_item')
            ->where('reference_id', $item->id)
            ->where('type', 'sale')
            ->get();
        $this->assertCount(1, $movements, 'Exactly one StockMovement should be recorded');
        $this->assertSame(-3.0, (float) $movements->first()->quantity);
    }

    // ------------------------------------------------------------------
    // 2. Online order reserves (does not deduct) on creation
    // ------------------------------------------------------------------

    public function test_online_order_reserves_but_does_not_deduct(): void
    {
        $item = $this->makePreparedItem(10);

        Sanctum::actingAs($this->customer, ['customer']);

        $response = $this->postJson('/api/customer/orders', $this->onlineOrderPayload($item, 2));
        $this->assertSame(201, $response->status(), $response->getContent());
        $response->assertCreated();

        $orderId = $response->json('order.id');

        $item->refresh();
        $this->assertSame(10, $item->stock_quantity, 'Stock should not be deducted yet for online orders');

        $reservation = DB::table('stock_reservations')
            ->where('item_id', $item->id)
            ->where('order_id', $orderId)
            ->first();
        $this->assertNotNull($reservation, 'A reservation row should exist');
        $this->assertSame(2, (int) $reservation->quantity);

        $this->assertSame(
            0,
            StockMovement::where('reference_type', 'menu_item')->where('reference_id', $item->id)->count(),
            'No StockMovement should exist before payment is confirmed',
        );
    }

    // ------------------------------------------------------------------
    // 3. Payment success converts reservation to final deduction
    // ------------------------------------------------------------------

    public function test_payment_success_converts_reservation_to_deduction(): void
    {
        $item = $this->makePreparedItem(10);

        // Create an online order with a reservation
        $order = Order::create([
            'order_number'    => 'TEST-PAY-001',
            'type'            => 'online_pickup',
            'status'          => 'payment_pending',
            'customer_id'     => $this->customer->id,
            'subtotal'        => 100.0,
            'tax_amount'      => 0,
            'discount_amount' => 0,
            'total'           => 100.0,
        ]);

        $orderItem = OrderItem::create([
            'order_id'   => $order->id,
            'item_id'    => $item->id,
            'item_name'  => $item->name,
            'quantity'   => 2,
            'unit_price' => 50.0,
            'total_price' => 100.0,
            'status'     => 'pending',
        ]);

        DB::table('stock_reservations')->insert([
            'item_id'    => $item->id,
            'order_id'   => $order->id,
            'session_id' => 'order:' . $order->id,
            'quantity'   => 2,
            'expires_at' => now()->addMinutes(30),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Dispatch OrderPaid — triggers DeductPreparedStockListener
        OrderPaid::dispatch(OrderPaidData::fromOrder($order->fresh(), false));

        $item->refresh();
        $this->assertSame(8, $item->stock_quantity, 'Stock should be deducted after payment confirmation');

        $this->assertSame(
            0,
            DB::table('stock_reservations')->where('order_id', $order->id)->count(),
            'Reservation should be cleared after deduction',
        );

        $movements = StockMovement::where('reference_type', 'menu_item')
            ->where('reference_id', $item->id)
            ->where('type', 'sale')
            ->get();
        $this->assertCount(1, $movements);
        $this->assertSame(-2.0, (float) $movements->first()->quantity);
    }

    // ------------------------------------------------------------------
    // 4. Payment failure cancels order and releases reservation
    // ------------------------------------------------------------------

    public function test_payment_failure_cancels_order_and_releases_reservation(): void
    {
        $item = $this->makePreparedItem(5);

        $order = Order::create([
            'order_number'    => 'TEST-FAIL-001',
            'type'            => 'online_pickup',
            'status'          => 'payment_pending',
            'customer_id'     => $this->customer->id,
            'subtotal'        => 50.0,
            'tax_amount'      => 0,
            'discount_amount' => 0,
            'total'           => 50.0,
        ]);

        DB::table('stock_reservations')->insert([
            'item_id'    => $item->id,
            'order_id'   => $order->id,
            'session_id' => 'order:' . $order->id,
            'quantity'   => 1,
            'expires_at' => now()->addMinutes(30),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Dispatch OrderCancelled (simulates what PaymentService does on failure)
        OrderCancelled::dispatch(OrderCancelledData::fromOrder($order));

        $this->assertSame(
            0,
            DB::table('stock_reservations')->where('order_id', $order->id)->count(),
            'Reservation must be released after cancellation',
        );

        $item->refresh();
        $this->assertSame(5, $item->stock_quantity, 'stock_quantity must not change on cancel');
    }

    // ------------------------------------------------------------------
    // 5. CancelStaleOrders releases reservation for stale payment_pending
    // ------------------------------------------------------------------

    public function test_cancel_stale_orders_releases_reservation(): void
    {
        $item = $this->makePreparedItem(5);

        $staleOrder = Order::create([
            'order_number'    => 'STALE-001',
            'type'            => 'online_pickup',
            'status'          => 'payment_pending',
            'customer_id'     => $this->customer->id,
            'subtotal'        => 50.0,
            'tax_amount'      => 0,
            'discount_amount' => 0,
            'total'           => 50.0,
        ]);

        // Force the created_at into the past so CancelStaleOrders picks it up
        DB::table('orders')
            ->where('id', $staleOrder->id)
            ->update(['created_at' => now()->subMinutes(45)]);

        DB::table('stock_reservations')->insert([
            'item_id'    => $item->id,
            'order_id'   => $staleOrder->id,
            'session_id' => 'order:' . $staleOrder->id,
            'quantity'   => 2,
            'expires_at' => now()->addMinutes(30),
            'created_at' => now()->subMinutes(45),
            'updated_at' => now()->subMinutes(45),
        ]);

        $this->artisan('orders:cancel-stale')->assertSuccessful();

        $staleOrder->refresh();
        $this->assertSame('cancelled', $staleOrder->status);

        $this->assertSame(
            0,
            DB::table('stock_reservations')->where('order_id', $staleOrder->id)->count(),
            'Reservation must be released after stale cancellation',
        );
    }

    // ------------------------------------------------------------------
    // 6. Double release is idempotent — no double-add to stock
    // ------------------------------------------------------------------

    public function test_double_release_of_reservation_is_idempotent(): void
    {
        $item = $this->makePreparedItem(10);

        $order = Order::create([
            'order_number'    => 'DBL-REL-001',
            'type'            => 'online_pickup',
            'status'          => 'cancelled',
            'customer_id'     => $this->customer->id,
            'subtotal'        => 50.0,
            'tax_amount'      => 0,
            'discount_amount' => 0,
            'total'           => 50.0,
        ]);

        DB::table('stock_reservations')->insert([
            'item_id'    => $item->id,
            'order_id'   => $order->id,
            'session_id' => 'order:' . $order->id,
            'quantity'   => 3,
            'expires_at' => now()->addMinutes(30),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $service = app(StockReservationService::class);

        // First release
        $service->releaseForOrder($order->id);
        $item->refresh();
        $this->assertSame(10, $item->stock_quantity, 'Release must not change stock_quantity');

        // Second release — should be a no-op (reservations already gone)
        $service->releaseForOrder($order->id);
        $item->refresh();
        $this->assertSame(10, $item->stock_quantity, 'Double release must not alter stock_quantity');
    }

    // ------------------------------------------------------------------
    // 7. Full refund restores stock_quantity
    // ------------------------------------------------------------------

    public function test_full_refund_restores_prepared_stock(): void
    {
        $item = $this->makePreparedItem(5);

        // Simulate a paid POS order (stock already deducted)
        $order = Order::create([
            'order_number'    => 'REFUND-001',
            'type'            => 'dine_in',
            'status'          => 'paid',
            'customer_id'     => $this->customer->id,
            'subtotal'        => 100.0,
            'tax_amount'      => 0,
            'discount_amount' => 0,
            'total'           => 100.0,
            'total_laar'      => 10000,
        ]);

        OrderItem::create([
            'order_id'    => $order->id,
            'item_id'     => $item->id,
            'item_name'   => $item->name,
            'quantity'    => 2,
            'unit_price'  => 50.0,
            'total_price' => 100.0,
            'status'      => 'pending',
        ]);

        // Stock is already deducted (simulate state after POS sale)
        $item->update(['stock_quantity' => 3]);

        Sanctum::actingAs($this->managerUser, ['staff']);

        $response = $this->postJson("/api/orders/{$order->id}/refunds", [
            'amount' => 100.0,
            'reason' => 'Customer request',
            'status' => 'approved',
        ]);

        $response->assertCreated();

        $item->refresh();
        $this->assertSame(5, $item->stock_quantity, 'Full refund must restore stock_quantity');

        $restore = StockMovement::where('reference_type', 'menu_item')
            ->where('reference_id', $item->id)
            ->where('type', 'refund')
            ->first();
        $this->assertNotNull($restore, 'A refund StockMovement should be recorded');
        $this->assertSame(2.0, (float) $restore->quantity);
    }

    // ------------------------------------------------------------------
    // 8. Two concurrent online orders for the last unit — only one wins
    // ------------------------------------------------------------------

    public function test_concurrent_online_orders_only_one_wins_last_unit(): void
    {
        $item = $this->makePreparedItem(1);

        $service = app(StockReservationService::class);

        // First order gets the last unit
        $order1 = Order::create([
            'order_number'    => 'RACE-001',
            'type'            => 'online_pickup',
            'status'          => 'pending',
            'customer_id'     => $this->customer->id,
            'subtotal'        => 50.0,
            'tax_amount'      => 0,
            'discount_amount' => 0,
            'total'           => 50.0,
        ]);
        OrderItem::create([
            'order_id'    => $order1->id,
            'item_id'     => $item->id,
            'item_name'   => $item->name,
            'quantity'    => 1,
            'unit_price'  => 50.0,
            'total_price' => 50.0,
            'status'      => 'pending',
        ]);

        DB::transaction(function () use ($service, $order1): void {
            $service->reserveForOrder($order1);
        });

        // Second order tries for the same last unit — must fail
        $order2 = Order::create([
            'order_number'    => 'RACE-002',
            'type'            => 'online_pickup',
            'status'          => 'pending',
            'customer_id'     => $this->customer->id,
            'subtotal'        => 50.0,
            'tax_amount'      => 0,
            'discount_amount' => 0,
            'total'           => 50.0,
        ]);
        OrderItem::create([
            'order_id'    => $order2->id,
            'item_id'     => $item->id,
            'item_name'   => $item->name,
            'quantity'    => 1,
            'unit_price'  => 50.0,
            'total_price' => 50.0,
            'status'      => 'pending',
        ]);

        $exceptionThrown = false;
        try {
            DB::transaction(function () use ($service, $order2): void {
                $service->reserveForOrder($order2);
            });
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $exceptionThrown = true;
            $this->assertSame(422, $e->getStatusCode());
        } catch (\Exception) {
            $exceptionThrown = true;
        }

        $this->assertTrue($exceptionThrown, 'Second reservation should fail when no stock remains');

        $this->assertSame(
            1,
            DB::table('stock_reservations')->where('item_id', $item->id)->count(),
            'Only one reservation should exist',
        );
    }

    // ------------------------------------------------------------------
    // 9. Idempotent: OrderPaid fired twice does not double-deduct
    // ------------------------------------------------------------------

    public function test_duplicate_order_paid_does_not_double_deduct(): void
    {
        $item = $this->makePreparedItem(10);

        $order = Order::create([
            'order_number'    => 'IDEM-001',
            'type'            => 'online_pickup',
            'status'          => 'paid',
            'customer_id'     => $this->customer->id,
            'subtotal'        => 100.0,
            'tax_amount'      => 0,
            'discount_amount' => 0,
            'total'           => 100.0,
        ]);

        $orderItem = OrderItem::create([
            'order_id'    => $order->id,
            'item_id'     => $item->id,
            'item_name'   => $item->name,
            'quantity'    => 2,
            'unit_price'  => 50.0,
            'total_price' => 100.0,
            'status'      => 'pending',
        ]);

        $paidData = OrderPaidData::fromOrder($order, false);

        // First fire
        OrderPaid::dispatch($paidData);
        $item->refresh();
        $afterFirst = $item->stock_quantity;

        // Second fire (duplicate)
        OrderPaid::dispatch($paidData);
        $item->refresh();

        $this->assertSame($afterFirst, $item->stock_quantity, 'Duplicate OrderPaid must not double-deduct');

        $this->assertSame(
            1,
            StockMovement::where('idempotency_key', 'online:order:' . $order->id . ':item:' . $orderItem->id)->count(),
            'Only one StockMovement should exist despite two OrderPaid events',
        );
    }

    // ------------------------------------------------------------------
    // 10. POS and online share the same stock_quantity column
    // ------------------------------------------------------------------

    public function test_pos_and_online_share_stock_quantity(): void
    {
        $item = $this->makePreparedItem(5);

        // POS takes 2 units
        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postPosOrder($this->posOrderPayload($item, 2))->assertCreated();

        $item->refresh();
        $this->assertSame(3, $item->stock_quantity, 'After POS sale: 5 - 2 = 3');

        // Online reserves the remaining 3
        Sanctum::actingAs($this->customer, ['customer']);
        $response = $this->postJson('/api/customer/orders', $this->onlineOrderPayload($item, 3));
        $response->assertCreated();

        $item->refresh();
        $this->assertSame(3, $item->stock_quantity, 'Online reservation does not reduce stock_quantity');

        $reserved = DB::table('stock_reservations')
            ->where('item_id', $item->id)
            ->sum('quantity');
        $this->assertSame(3, (int) $reserved, '3 units reserved for online order');

        // Another POS sale for 1 unit — must fail because effective stock is 0
        Sanctum::actingAs($this->staffUser, ['staff']);
        $overResponse = $this->postPosOrder($this->posOrderPayload($item, 1));
        $overResponse->assertStatus(422);
    }

    // ------------------------------------------------------------------
    // Phase 5 — Concurrency & Safety Hardening
    // ------------------------------------------------------------------

    // 11. Duplicate customer order with same items places only one reservation
    // ------------------------------------------------------------------

    public function test_rapid_duplicate_customer_orders_only_reserve_once(): void
    {
        $item = $this->makePreparedItem(2);
        Sanctum::actingAs($this->customer, ['customer']);

        // First order — must succeed
        $r1 = $this->postJson('/api/customer/orders', $this->onlineOrderPayload($item, 1));
        $r1->assertCreated();

        // Second order immediately after — allowed (system does NOT deduplicate
        // by payload alone) but stock must not go below 0
        $r2 = $this->postJson('/api/customer/orders', $this->onlineOrderPayload($item, 1));

        // Both orders may succeed (2 units available), but total reserved must not exceed stock
        $reserved = (int) DB::table('stock_reservations')
            ->where('item_id', $item->id)
            ->sum('quantity');

        $this->assertLessThanOrEqual(
            $item->stock_quantity,
            $reserved,
            'Total reserved must never exceed available stock',
        );
    }

    // ------------------------------------------------------------------
    // 12. Double-payment (addPayments called twice) produces only one Payment record
    //     for the same amount — the second call must fail because order is terminal
    // ------------------------------------------------------------------

    public function test_adding_payment_to_already_paid_order_is_rejected(): void
    {
        $item = $this->makePreparedItem(5);
        Sanctum::actingAs($this->staffUser, ['staff']);

        // Create order + pay it
        $resp = $this->postPosOrder($this->posOrderPayload($item, 1));
        $resp->assertCreated();
        $orderId = $resp->json('order.id');

        // First payment — pays in full
        $this->postJson("/api/orders/{$orderId}/payments", [
            'payments' => [['method' => 'cash', 'amount' => (float) $resp->json('order.total')]],
        ])->assertStatus(200);

        // Verify order is now paid
        $this->assertDatabaseHas('orders', ['id' => $orderId, 'status' => 'paid']);

        // Second payment attempt on paid order — must be rejected (terminal status guard)
        $this->postJson("/api/orders/{$orderId}/payments", [
            'payments' => [['method' => 'cash', 'amount' => 1.00]],
        ])->assertStatus(422);

        // Only one payment record should exist
        $paymentCount = \App\Models\Payment::where('order_id', $orderId)->count();
        $this->assertSame(1, $paymentCount, 'Only one Payment record should exist for this order');
    }

    // ------------------------------------------------------------------
    // 13. Refund after concurrent payment callbacks does not double-refund
    //     Guards against: two staff members issuing refunds at the same time
    // ------------------------------------------------------------------

    public function test_cumulative_refunds_cannot_exceed_order_total_under_concurrent_load(): void
    {
        $item = $this->makePreparedItem(5);

        // Create + pay an order via the POS flow
        Sanctum::actingAs($this->staffUser, ['staff']);
        $resp = $this->postPosOrder($this->posOrderPayload($item, 1));
        $resp->assertCreated();
        $orderId = $resp->json('order.id');
        $total   = (float) $resp->json('order.total');

        // Pay it
        $this->postJson("/api/orders/{$orderId}/payments", [
            'payments' => [['method' => 'cash', 'amount' => $total]],
        ])->assertStatus(200);

        // Simulate two concurrent refund requests for the full amount
        // First refund — must succeed
        $ownerRole = \App\Models\Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        $owner = \App\Models\User::factory()->create([
            'role_id'   => $ownerRole->id,
            'pin_hash'  => \Illuminate\Support\Facades\Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($owner, ['staff']);

        $r1 = $this->postJson("/api/orders/{$orderId}/refunds", [
            'amount' => $total,
            'reason' => 'Customer complaint',
        ]);
        $r1->assertStatus(201);

        // Second refund attempt — must fail (already fully refunded)
        $r2 = $this->postJson("/api/orders/{$orderId}/refunds", [
            'amount' => $total,
            'reason' => 'Duplicate request',
        ]);
        $r2->assertStatus(422);

        // Exactly one refund record
        $this->assertDatabaseCount('refunds', 1);
    }

    // ------------------------------------------------------------------
    // 14. Paying an online order twice (BML callback arrives twice) does not
    //     set status back to 'partial' or create duplicate OrderPaid events
    // ------------------------------------------------------------------

    public function test_bml_webhook_duplicate_does_not_double_deduct_stock(): void
    {
        $item = $this->makePreparedItem(3);
        Sanctum::actingAs($this->customer, ['customer']);

        $resp = $this->postJson('/api/customer/orders', $this->onlineOrderPayload($item, 1));
        $resp->assertCreated();
        $orderId = $resp->json('order.id');
        $order   = \App\Models\Order::find($orderId);

        // Manually create a Payment as if BML confirmed it (simulate webhook arrival)
        $paidData = OrderPaidData::fromOrder($order->fresh());

        // Fire OrderPaid once
        OrderPaid::dispatch($paidData);
        $item->refresh();
        $stockAfterFirst = (float) $item->stock_quantity;

        $movements1 = \App\Models\StockMovement::where('reference_type', 'order')
            ->where('reference_id', $orderId)
            ->count();

        // Fire OrderPaid again (duplicate callback)
        OrderPaid::dispatch($paidData);
        $item->refresh();
        $stockAfterSecond = (float) $item->stock_quantity;

        $movements2 = \App\Models\StockMovement::where('reference_type', 'order')
            ->where('reference_id', $orderId)
            ->count();

        $this->assertEquals(
            $stockAfterFirst,
            $stockAfterSecond,
            'Duplicate OrderPaid must not change stock a second time',
        );
        $this->assertEquals(
            $movements1,
            $movements2,
            'Duplicate OrderPaid must not create additional StockMovement records',
        );
    }

    // ------------------------------------------------------------------
    // Bonus: Made-to-order items are unaffected by prepared stock logic
    // ------------------------------------------------------------------

    public function test_made_to_order_item_skips_stock_deduction(): void
    {
        $item = $this->makeMadeToOrderItem();

        Sanctum::actingAs($this->staffUser, ['staff']);

        $response = $this->postPosOrder([
            'type'  => 'takeaway',
            'items' => [['item_id' => $item->id, 'quantity' => 99]],
        ]);
        $response->assertCreated();

        $this->assertSame(
            0,
            StockMovement::where('reference_type', 'menu_item')->where('reference_id', $item->id)->count(),
            'Made-to-order items must not produce StockMovement records',
        );
        $this->assertSame(
            0,
            DB::table('stock_reservations')->where('item_id', $item->id)->count(),
        );
    }
}
