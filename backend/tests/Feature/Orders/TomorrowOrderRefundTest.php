<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\LoyaltyAccount;
use App\Models\LoyaltyHold;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Reservation;
use App\Models\RestaurantTable;
use App\Models\Role;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\OrderFulfilDateService;
use App\Services\OrderStatusMachine;
use App\Services\TomorrowDailyCapacityService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Paid collect-tomorrow orders are held from kitchen (fired_at null) until
 * collection day. They sit in status `pending` with payment_status=paid.
 *
 * UPDATED: pending → refunded|partially_refunded is now allowed so staff can
 * refund before kitchen starts / before collection day. Earlier versions of
 * these tests documented the broken 422; that was incorrect product behaviour.
 */
class TomorrowOrderRefundTest extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    private Customer $customer;

    private User $owner;

    private string $fulfilDate;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);

        $category = Category::create([
            'name' => 'Tomorrow Refund Cat',
            'slug' => 'tomorrow-refund-cat',
            'is_active' => true,
        ]);

        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Tomorrow Bun',
            'base_price' => 50.0,
            'sku' => 'TMW-BUN-001',
            'is_active' => true,
            'is_available' => true,
            'allow_pre_order' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 20,
            'tomorrow_daily_capacity' => 2,
        ]);

        $this->customer = Customer::create([
            'name' => 'Tomorrow Refund Customer',
            'phone' => '+9607770666',
            'is_active' => true,
        ]);

        $ownerRole = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        $this->owner = User::factory()->create([
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $this->setSetting('online_ordering_enabled', '1');
        $this->setSetting(OrderFulfilDateService::SETTING_KEY, '20:00');

        Carbon::setTestNow(Carbon::parse('2026-08-04 15:00:00', config('app.timezone')));
        $this->fulfilDate = app(OrderFulfilDateService::class)->allowedTomorrowDateString();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function setSetting(string $key, ?string $value): void
    {
        SiteSetting::updateOrCreate(['key' => $key], [
            'value' => $value,
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => $key,
            'is_public' => true,
        ]);
        Cache::forget("site_setting.{$key}");
    }

    private function openOwnerShift(): void
    {
        $device = $this->makeDevice('pos', ['identifier' => 'TMW-REFUND-POS']);
        Shift::create([
            'user_id' => $this->owner->id,
            'device_id' => $device->id,
            'opened_at' => now(),
            'opening_cash' => 100,
        ]);
    }

    /**
     * Paid collect-tomorrow order that has NOT been fired to kitchen.
     * Stock was never deducted (deferred until fire).
     */
    private function makePaidUnfiredTomorrowOrder(int $qty = 1): Order
    {
        $total = 50.0 * $qty;
        $order = Order::factory()->paid()->create([
            'customer_id' => $this->customer->id,
            'user_id' => null,
            'type' => 'online_pickup',
            'status' => 'pending',
            'payment_status' => 'paid',
            'fulfil_date' => $this->fulfilDate,
            'fired_at' => null,
            'total' => $total,
            'total_laar' => (int) round($total * 100),
            'subtotal' => $total,
            'tax_amount' => 0,
        ]);

        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'quantity' => $qty,
            'unit_price' => 50.0,
            'total_price' => $total,
            'status' => 'pending',
        ]);

        OrderPaid::dispatch(OrderPaidData::fromOrder($order->fresh(), true));

        $this->assertNull($order->fresh()->fired_at);
        $this->assertSame(20, (int) $this->item->fresh()->stock_quantity);
        $this->assertSame(
            0,
            StockMovement::query()->where('reference_id', $order->id)->where('type', 'sale')->count(),
        );

        return $order->fresh(['items']);
    }

    private function authHeader(): array
    {
        return ['Authorization' => 'Bearer '.$this->owner->createToken('test', ['staff'])->plainTextToken];
    }

    private function remainingCapacity(): int
    {
        $map = app(TomorrowDailyCapacityService::class)->remainingMap(
            collect([$this->item->fresh()]),
            $this->fulfilDate,
        );

        return (int) ($map[$this->item->id] ?? 0);
    }

    public function test_unfired_tomorrow_order_never_deducted_stock(): void
    {
        $order = $this->makePaidUnfiredTomorrowOrder(1);
        $this->assertSame('pending', $order->status);
        $this->assertSame('paid', $order->payment_status);
        $this->assertNull($order->fired_at);
        $this->assertSame(20, (int) $this->item->fresh()->stock_quantity);
        $this->assertSame(1, 2 - $this->remainingCapacity());
    }

    public function test_full_refund_unfired_tomorrow_order_succeeds_and_frees_capacity(): void
    {
        $this->openOwnerShift();
        $order = $this->makePaidUnfiredTomorrowOrder(1);

        $response = $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 50.00, 'reason' => 'Customer cancelled before collection day'],
            $this->authHeader(),
        );

        $response->assertCreated();
        $this->assertDatabaseHas('refunds', ['order_id' => $order->id]);
        $this->assertSame('refunded', $order->fresh()->status);
        // Capacity freed — order status is now in EXCLUDED_STATUSES.
        $this->assertSame(2, $this->remainingCapacity());
        // Stock never deducted, still untouched.
        $this->assertSame(20, (int) $this->item->fresh()->stock_quantity);
    }

    public function test_partial_refund_unfired_tomorrow_order_succeeds(): void
    {
        $this->openOwnerShift();
        $order = $this->makePaidUnfiredTomorrowOrder(2);

        $response = $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 50.00, 'reason' => 'Cancel one of two'],
            $this->authHeader(),
        );

        $response->assertCreated();
        $this->assertDatabaseHas('refunds', ['order_id' => $order->id]);
        $this->assertSame('partially_refunded', $order->fresh()->status);
        // Partial refund keeps capacity consumed (still cooking for remaining items).
        $this->assertSame(0, $this->remainingCapacity());
        $this->assertSame(20, (int) $this->item->fresh()->stock_quantity);
    }

    public function test_paid_pending_order_full_and_partial_refund_allowed_by_machine(): void
    {
        $machine = app(OrderStatusMachine::class);
        $this->assertTrue($machine->isAllowed('pending', 'refunded'));
        $this->assertTrue($machine->isAllowed('pending', 'partially_refunded'));
        // Never paid — still blocked.
        $this->assertFalse($machine->isAllowed('payment_pending', 'refunded'));
        $this->assertFalse($machine->isAllowed('payment_pending', 'partially_refunded'));
    }

    public function test_payment_pending_order_cannot_be_refunded(): void
    {
        $this->openOwnerShift();
        $order = Order::factory()->create([
            'customer_id' => $this->customer->id,
            'user_id' => null,
            'type' => 'online_pickup',
            'status' => 'payment_pending',
            'payment_status' => 'unpaid',
            'total' => 50.0,
            'total_laar' => 5000,
            'subtotal' => 50.0,
            'tax_amount' => 0,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'quantity' => 1,
            'unit_price' => 50.0,
            'total_price' => 50.0,
            'status' => 'pending',
        ]);

        $response = $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 50.00, 'reason' => 'Should not work'],
            $this->authHeader(),
        );

        $response->assertStatus(422);
        $this->assertDatabaseMissing('refunds', ['order_id' => $order->id]);
        $this->assertSame('payment_pending', $order->fresh()->status);
    }

    public function test_full_refund_releases_active_loyalty_hold_and_table_reservation(): void
    {
        $this->openOwnerShift();
        $order = $this->makePaidUnfiredTomorrowOrder(1);

        LoyaltyAccount::create([
            'customer_id' => $this->customer->id,
            'points_balance' => 1000,
            'points_held' => 100,
            'lifetime_points' => 1000,
            'tier' => 'bronze',
        ]);
        LoyaltyHold::create([
            'idempotency_key' => 'test-hold-refund-'.$order->id,
            'customer_id' => $this->customer->id,
            'order_id' => $order->id,
            'points_held' => 100,
            'discount_laar' => 1000,
            'status' => 'active',
            'expires_at' => now()->addHour(),
        ]);

        $table = RestaurantTable::create([
            'name' => 'T-Refund-1',
            'capacity' => 4,
            'status' => 'available',
            'is_active' => true,
        ]);
        $reservation = Reservation::create([
            'customer_id' => $this->customer->id,
            'customer_name' => $this->customer->name,
            'customer_phone' => $this->customer->phone,
            'order_id' => $order->id,
            'table_id' => $table->id,
            'party_size' => 2,
            'date' => now()->addDay()->toDateString(),
            'time_slot' => '18:00:00',
            'status' => 'confirmed',
        ]);

        $response = $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 50.00, 'reason' => 'Release holds'],
            $this->authHeader(),
        );

        $response->assertCreated();
        $this->assertSame('refunded', $order->fresh()->status);
        $this->assertSame('released', LoyaltyHold::query()->where('order_id', $order->id)->value('status'));
        $this->assertSame('cancelled', $reservation->fresh()->status);
    }
}
