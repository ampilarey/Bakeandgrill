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
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\OrderCreationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Prepaid dine-in Stage 1: customer can create a paid dine-in order.
 * Service charge applies, packaging does not, stock is reserved (not
 * deducted) until pay, and the ticket stays off KDS until staff fire it.
 */
class PrepaidDineInStage1Test extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    private Customer $customer;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);

        $category = Category::create([
            'name' => 'Dine In Cat',
            'slug' => 'dine-in-cat',
            'is_active' => true,
        ]);

        // Item::created() seeds all ordering channels enabled, incl. dine_in.
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Grill Platter',
            'base_price' => 100.0,
            'sku' => 'DINEIN-PLATTER-001',
            'is_active' => true,
            'is_available' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 5,
        ]);

        $this->customer = Customer::create([
            'name' => 'Dine In Customer',
            'phone' => '+9607770200',
            'is_active' => true,
        ]);

        // Stage 2 holds a table per prepaid order — seed one so creates succeed.
        \App\Models\RestaurantTable::create([
            'name' => 'S1-T1',
            'capacity' => 6,
            'status' => 'available',
            'is_active' => true,
        ]);

        $staffRole = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        $this->staff = User::create([
            'name' => 'Dine In Staff',
            'email' => 'dinein-staff@test.com',
            'password' => Hash::make('password'),
            'role_id' => $staffRole->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $settings = [
            'online_ordering_enabled' => '1',
            'dine_in_preorder_enabled' => '1',
            // Slot capacity machinery is exercised elsewhere; keep tests simple.
            'pickup_slots_enabled' => '0',
            'service_charge_enabled' => '1',
            'service_charge_type' => 'percent',
            'service_charge_value' => '10',
            'service_charge_apply_dine_in' => '1',
            'service_charge_apply_online_pickup' => '0',
        ];
        foreach ($settings as $key => $value) {
            SiteSetting::set($key, $value);
        }
        SiteSetting::bust();
    }

    private function dineInPayload(array $overrides = []): array
    {
        return array_merge([
            'type' => 'dine_in',
            'party_size' => 2,
            'pickup_slot_at' => now()->addHours(2)->toIso8601String(),
            'items' => [['item_id' => $this->item->id, 'quantity' => 2]],
        ], $overrides);
    }

    public function test_customer_dine_in_gets_service_charge_and_no_packaging(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);

        $res = $this->postJson('/api/customer/orders', $this->dineInPayload());
        $res->assertCreated();

        $order = Order::findOrFail($res->json('order.id'));
        $this->assertSame('dine_in', $order->type);
        $this->assertSame('payment_pending', $order->status);
        $this->assertNull($order->fired_at);
        $this->assertGreaterThan(0, (int) $order->service_charge_amount_laar);
        $this->assertSame('dine_in', $order->service_charge_applied_to);
        $this->assertSame(0, (int) $order->packaging_fee_laar);
        $this->assertSame(0, (int) $order->small_order_fee_laar);
    }

    public function test_stock_reserved_at_create_and_converted_on_paid(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);

        $res = $this->postJson('/api/customer/orders', $this->dineInPayload());
        $res->assertCreated();
        $order = Order::findOrFail($res->json('order.id'));

        $this->item->refresh();
        $this->assertSame(5, (int) $this->item->stock_quantity, 'Stock must not deduct before payment');
        $this->assertSame(
            1,
            DB::table('stock_reservations')->where('order_id', $order->id)->count(),
            'Prepaid dine-in must reserve stock like other online orders',
        );

        $order->update(['status' => 'pending', 'payment_status' => 'paid', 'paid_at' => now()]);
        OrderPaid::dispatch(OrderPaidData::fromOrder($order->fresh(), true));

        $this->item->refresh();
        $this->assertSame(3, (int) $this->item->stock_quantity, 'Payment converts the reservation to a deduction');
        $this->assertSame(0, DB::table('stock_reservations')->where('order_id', $order->id)->count());
    }

    public function test_staff_pos_dine_in_does_not_double_deduct_on_paid(): void
    {
        $order = app(OrderCreationService::class)->createFromPayload([
            'type' => 'dine_in',
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 2]],
        ], $this->staff);

        $this->item->refresh();
        $this->assertSame(3, (int) $this->item->stock_quantity, 'POS dine-in deducts at create');

        $order->update(['status' => 'paid', 'payment_status' => 'paid', 'paid_at' => now()]);
        OrderPaid::dispatch(OrderPaidData::fromOrder($order->fresh(), true));

        $this->item->refresh();
        $this->assertSame(3, (int) $this->item->stock_quantity, 'OrderPaid must not deduct POS dine-in again');
    }

    public function test_balance_settle_after_fire_does_not_deduct_again(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);
        $res = $this->postJson('/api/customer/orders', $this->dineInPayload());
        $order = Order::findOrFail($res->json('order.id'));

        $order->update(['status' => 'pending', 'payment_status' => 'paid', 'paid_at' => now()]);
        OrderPaid::dispatch(OrderPaidData::fromOrder($order->fresh(), true));
        $this->item->refresh();
        $this->assertSame(3, (int) $this->item->stock_quantity);

        // Staff fire before arrival, then a later balance settle re-fires OrderPaid.
        $order->update(['fired_at' => now()]);
        OrderPaid::dispatch(OrderPaidData::fromOrder($order->fresh(), true));

        $this->item->refresh();
        $this->assertSame(3, (int) $this->item->stock_quantity, 'Second OrderPaid after fire must be a no-op');
    }

    public function test_prepaid_dine_in_hidden_from_kds_until_fired(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);
        $res = $this->postJson('/api/customer/orders', $this->dineInPayload());
        $orderId = (int) $res->json('order.id');

        Order::where('id', $orderId)->update([
            'status' => 'pending',
            'payment_status' => 'paid',
            'paid_at' => now(),
        ]);

        Sanctum::actingAs($this->staff, ['staff']);
        $kds = $this->getJson('/api/kds/orders');
        $kds->assertOk();
        $this->assertNotContains($orderId, collect($kds->json('orders'))->pluck('id')->all());

        $fire = $this->postJson("/api/orders/{$orderId}/fire-to-kitchen");
        $fire->assertOk();

        $kdsAfter = $this->getJson('/api/kds/orders');
        $this->assertContains($orderId, collect($kdsAfter->json('orders'))->pluck('id')->all());
    }

    public function test_toggle_off_rejects_customer_dine_in(): void
    {
        SiteSetting::set('dine_in_preorder_enabled', '0');

        Sanctum::actingAs($this->customer, ['customer']);
        $res = $this->postJson('/api/customer/orders', $this->dineInPayload());
        $res->assertStatus(422);
        $this->assertSame(0, Order::count());
    }

    public function test_dine_in_for_tomorrow_is_rejected(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);
        $res = $this->postJson('/api/customer/orders', $this->dineInPayload([
            'collect_on' => 'tomorrow',
        ]));
        $res->assertStatus(422);
    }

    public function test_dine_in_requires_arrival_time_and_party_size(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);

        $noSlot = $this->dineInPayload();
        unset($noSlot['pickup_slot_at']);
        $this->postJson('/api/customer/orders', $noSlot)->assertStatus(422);

        $noParty = $this->dineInPayload();
        unset($noParty['party_size']);
        $this->postJson('/api/customer/orders', $noParty)->assertStatus(422);
    }
}
