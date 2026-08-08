<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Role;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\StockMovement;
use App\Models\User;
use App\Services\OrderFulfilDateService;
use App\Services\TomorrowDailyCapacityService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Paid collect-tomorrow orders are held from kitchen (fired_at null) until
 * collection day. These tests prove whether the day-before refund path works.
 *
 * FINDING (do not "fix" transitions to silence these): a paid unfired
 * tomorrow order sits in status `pending`. RefundController full/partial
 * refunds call OrderStatusTransitionService → refunded / partially_refunded,
 * and OrderStatusMachine rejects `pending → refunded` and
 * `pending → partially_refunded`. The refund never creates a row.
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

    public function test_full_refund_unfired_tomorrow_order_is_blocked(): void
    {
        $this->openOwnerShift();
        $order = $this->makePaidUnfiredTomorrowOrder(1);

        $response = $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 50.00, 'reason' => 'Customer cancelled before collection day'],
            $this->authHeader(),
        );

        // BUG: pending → refunded is rejected by OrderStatusMachine.
        $response->assertStatus(422);
        $this->assertStringContainsString(
            "pending' → 'refunded'",
            (string) $response->json('message'),
        );
        $this->assertDatabaseMissing('refunds', ['order_id' => $order->id]);
        $this->assertSame('pending', $order->fresh()->status);
        // Capacity remains consumed — customer cannot rebook the slot.
        $this->assertSame(1, 2 - $this->remainingCapacity());
        // Stock still correct (never deducted, never falsely restored).
        $this->assertSame(20, (int) $this->item->fresh()->stock_quantity);
    }

    public function test_partial_refund_unfired_tomorrow_order_is_blocked(): void
    {
        $this->openOwnerShift();
        $order = $this->makePaidUnfiredTomorrowOrder(2);

        $response = $this->postJson(
            "/api/orders/{$order->id}/refunds",
            ['amount' => 50.00, 'reason' => 'Cancel one of two'],
            $this->authHeader(),
        );

        // BUG: pending → partially_refunded is also rejected.
        $response->assertStatus(422);
        $this->assertStringContainsString(
            "pending' → 'partially_refunded'",
            (string) $response->json('message'),
        );
        $this->assertDatabaseMissing('refunds', ['order_id' => $order->id]);
        $this->assertSame(0, $this->remainingCapacity());
        $this->assertSame(20, (int) $this->item->fresh()->stock_quantity);
    }
}
