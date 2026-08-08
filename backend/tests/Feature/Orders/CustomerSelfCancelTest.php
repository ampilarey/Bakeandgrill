<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Orders\DTOs\OrderPaidData;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\LoyaltyAccount;
use App\Models\LoyaltyHold;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Reservation;
use App\Models\RestaurantTable;
use App\Models\Role;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\OrderFulfilDateService;
use App\Services\TomorrowDailyCapacityService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerSelfCancelTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Customer $otherCustomer;

    private Item $item;

    private User $staff;

    private User $owner;

    private string $fulfilDate;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $category = Category::create([
            'name' => 'Self Cancel Cat',
            'slug' => 'self-cancel-cat',
            'is_active' => true,
        ]);

        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Self Cancel Bun',
            'base_price' => 50.0,
            'sku' => 'SELF-CANCEL-001',
            'is_active' => true,
            'is_available' => true,
            'allow_pre_order' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 20,
            'tomorrow_daily_capacity' => 2,
        ]);

        $this->customer = Customer::create([
            'name' => 'Self Cancel Customer',
            'phone' => '+9607770111',
            'is_active' => true,
        ]);
        $this->otherCustomer = Customer::create([
            'name' => 'Other Customer',
            'phone' => '+9607770222',
            'is_active' => true,
        ]);

        $staffRole = Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        $ownerRole = Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        $this->staff = User::factory()->create([
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->owner = User::factory()->create([
            'role_id' => $ownerRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        SiteSetting::updateOrCreate(['key' => OrderFulfilDateService::SETTING_KEY], [
            'value' => '20:00',
            'type' => 'text',
            'group' => 'Online Ordering',
            'label' => OrderFulfilDateService::SETTING_KEY,
            'is_public' => true,
        ]);
        Cache::forget('site_setting.'.OrderFulfilDateService::SETTING_KEY);

        Carbon::setTestNow(Carbon::parse('2026-08-04 15:00:00', config('app.timezone')));
        $this->fulfilDate = app(OrderFulfilDateService::class)->allowedTomorrowDateString();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function authAsCustomer(Customer $customer): array
    {
        return ['Authorization' => 'Bearer '.$customer->createToken('test', ['customer'])->plainTextToken];
    }

    private function makePaidUnstartedOrder(array $overrides = []): Order
    {
        $order = Order::factory()->paid()->create(array_merge([
            'customer_id' => $this->customer->id,
            'user_id' => null,
            'type' => 'online_pickup',
            'status' => 'pending',
            'payment_status' => 'paid',
            'fired_at' => null,
            'total' => 50,
            'total_laar' => 5000,
            'subtotal' => 50,
            'tax_amount' => 0,
            'fulfil_date' => $this->fulfilDate,
        ], $overrides));

        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $this->item->id,
            'item_name' => $this->item->name,
            'quantity' => 1,
            'unit_price' => 50.0,
            'total_price' => 50.0,
            'status' => 'pending',
        ]);

        if (! Payment::where('order_id', $order->id)->exists()) {
            Payment::create([
                'order_id' => $order->id,
                'method' => 'card',
                'amount' => 50,
                'amount_laar' => 5000,
                'status' => 'confirmed',
            ]);
        }

        DB::table('stock_reservations')->insert([
            'order_id' => $order->id,
            'item_id' => $this->item->id,
            'variant_id' => null,
            'session_id' => 'order:'.$order->id,
            'quantity' => 1,
            'expires_at' => now()->addHour(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Mimic payment confirmation side-effects for capacity / stock listeners.
        OrderPaid::dispatch(OrderPaidData::fromOrder($order->fresh(), true));

        // Active hold after pay (rare) — still must release on customer self-cancel.
        LoyaltyAccount::firstOrCreate(
            ['customer_id' => $this->customer->id],
            [
                'points_balance' => 90,
                'points_held' => 10,
                'lifetime_points' => 100,
                'tier' => 'bronze',
            ],
        );
        LoyaltyHold::create([
            'idempotency_key' => 'self-cancel-hold-'.$order->id,
            'customer_id' => $this->customer->id,
            'order_id' => $order->id,
            'points_held' => 10,
            'discount_laar' => 100,
            'status' => 'active',
            'expires_at' => now()->addHour(),
        ]);

        return $order->fresh(['items', 'payments']);
    }

    public function test_customer_can_cancel_own_unstarted_unpaid_order(): void
    {
        $order = Order::factory()->create([
            'customer_id' => $this->customer->id,
            'user_id' => null,
            'type' => 'online_pickup',
            'status' => 'payment_pending',
            'payment_status' => 'unpaid',
            'fired_at' => null,
            'total' => 50,
            'total_laar' => 5000,
        ]);

        $res = $this->postJson(
            "/api/customer/orders/{$order->id}/cancel",
            [],
            $this->authAsCustomer($this->customer),
        );

        $res->assertOk()
            ->assertJsonPath('order.status', 'cancelled')
            ->assertJsonPath('refunded', false);
        $this->assertSame('cancelled', $order->fresh()->status);
        $this->assertDatabaseMissing('refunds', ['order_id' => $order->id]);
    }

    public function test_customer_can_cancel_own_unstarted_paid_order_with_refund(): void
    {
        $order = $this->makePaidUnstartedOrder();
        $capacityBefore = (int) (app(TomorrowDailyCapacityService::class)
            ->remainingMap(collect([$this->item->fresh()]), $this->fulfilDate)[$this->item->id] ?? 0);
        $this->assertSame(1, 2 - $capacityBefore);

        $res = $this->postJson(
            "/api/customer/orders/{$order->id}/cancel",
            [],
            $this->authAsCustomer($this->customer),
        );

        $res->assertOk()
            ->assertJsonPath('order.status', 'refunded')
            ->assertJsonPath('refunded', true)
            ->assertJsonPath('refund.initiated_by', 'customer')
            ->assertJsonPath('refund.status', 'approved')
            ->assertJsonPath('refund.reason_category', 'order_cancelled');

        $refund = Refund::where('order_id', $order->id)->first();
        $this->assertNotNull($refund);
        $this->assertSame('customer', $refund->initiated_by);
        $this->assertSame($this->customer->id, (int) $refund->customer_id);
        $this->assertNull($refund->user_id);
        $this->assertNull($refund->approved_by);
        $this->assertNull($refund->shift_id);
        $this->assertNull($refund->otp_verified_at);
        $this->assertFalse((bool) $refund->otp_owner_override);

        $this->assertSame('refunded', $order->fresh()->status);

        // Capacity freed (cancelled/refunded excluded from tomorrow bucket).
        $capacityAfter = (int) (app(TomorrowDailyCapacityService::class)
            ->remainingMap(collect([$this->item->fresh()]), $this->fulfilDate)[$this->item->id] ?? 0);
        $this->assertSame(2, $capacityAfter);

        // Stock reservation released.
        $this->assertSame(
            0,
            (int) DB::table('stock_reservations')->where('order_id', $order->id)->count(),
        );

        // Loyalty hold released.
        $this->assertSame(
            'released',
            LoyaltyHold::query()->where('order_id', $order->id)->value('status'),
        );
    }

    public function test_customer_cannot_cancel_someone_elses_order(): void
    {
        $order = $this->makePaidUnstartedOrder();

        $res = $this->postJson(
            "/api/customer/orders/{$order->id}/cancel",
            [],
            $this->authAsCustomer($this->otherCustomer),
        );

        $res->assertForbidden();
        $this->assertSame('pending', $order->fresh()->status);
        $this->assertDatabaseMissing('refunds', ['order_id' => $order->id]);
    }

    public function test_customer_cannot_cancel_once_kitchen_has_started(): void
    {
        $order = $this->makePaidUnstartedOrder([
            'status' => 'in_progress',
            'fired_at' => now(),
        ]);

        $res = $this->postJson(
            "/api/customer/orders/{$order->id}/cancel",
            [],
            $this->authAsCustomer($this->customer),
        );

        $res->assertStatus(422);
        $this->assertSame('in_progress', $order->fresh()->status);
        $this->assertDatabaseMissing('refunds', ['order_id' => $order->id]);
    }

    public function test_customer_cannot_cancel_when_fired_even_if_status_still_pending(): void
    {
        $order = $this->makePaidUnstartedOrder([
            'status' => 'pending',
            'fired_at' => now(),
        ]);

        $this->postJson(
            "/api/customer/orders/{$order->id}/cancel",
            [],
            $this->authAsCustomer($this->customer),
        )->assertStatus(422);

        $this->assertSame('pending', $order->fresh()->status);
    }

    public function test_paid_self_cancel_releases_table_reservation(): void
    {
        $table = RestaurantTable::create([
            'name' => 'T-Self-Cancel',
            'capacity' => 4,
            'is_active' => true,
            'status' => 'available',
        ]);

        $order = $this->makePaidUnstartedOrder([
            'type' => 'dine_in',
            'status' => 'paid',
            'fulfil_date' => null,
        ]);

        Reservation::create([
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

        $this->postJson(
            "/api/customer/orders/{$order->id}/cancel",
            [],
            $this->authAsCustomer($this->customer),
        )->assertOk()->assertJsonPath('order.status', 'refunded');

        $this->assertSame('cancelled', Reservation::where('order_id', $order->id)->value('status'));
    }

    public function test_show_exposes_can_cancel_for_unstarted_order(): void
    {
        $order = $this->makePaidUnstartedOrder();

        $this->getJson(
            "/api/customer/orders/{$order->id}",
            $this->authAsCustomer($this->customer),
        )
            ->assertOk()
            ->assertJsonPath('order.can_cancel', true)
            ->assertJsonPath('order.fired_at', null);
    }

    public function test_staff_cancel_endpoint_and_permissions_unchanged(): void
    {
        $order = Order::factory()->create([
            'customer_id' => $this->customer->id,
            'user_id' => null,
            'type' => 'online_pickup',
            'status' => 'payment_pending',
            'payment_status' => 'unpaid',
            'fired_at' => null,
            'total' => 50,
            'total_laar' => 5000,
        ]);

        // Customer token cannot use staff cancel.
        $this->postJson(
            "/api/orders/{$order->id}/cancel",
            ['reason' => 'Customer trying staff path'],
            $this->authAsCustomer($this->customer),
        )->assertForbidden();

        // Staff without void permission still blocked.
        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson("/api/orders/{$order->id}/cancel", ['reason' => 'No void perm'])
            ->assertForbidden();

        // Paid order still refused on staff cancel (refund path required).
        $paid = $this->makePaidUnstartedOrder(['fulfil_date' => null]);
        $device = Device::firstOrCreate(
            ['identifier' => 'SELF-CANCEL-POS'],
            ['name' => 'Self Cancel POS', 'type' => 'pos', 'is_active' => true, 'status' => 'approved'],
        );
        Shift::create([
            'user_id' => $this->owner->id,
            'device_id' => $device->id,
            'opened_at' => now(),
            'opening_cash' => 100,
        ]);
        Sanctum::actingAs($this->owner, ['staff']);
        $this->withHeader('X-Device-Identifier', $device->identifier)
            ->postJson("/api/orders/{$paid->id}/cancel", ['reason' => 'Should use refund'])
            ->assertStatus(422);
        $this->assertNotSame('cancelled', $paid->fresh()->status);
    }
}
