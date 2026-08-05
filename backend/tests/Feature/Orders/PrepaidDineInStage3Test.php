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
use App\Models\Reservation;
use App\Models\RestaurantTable;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Prepaid dine-in Stage 3: add-ons on the same bill.
 * Prepaid orders may grow at the table (paid → partial), never shrink below
 * the amount paid, and the balance settles through the normal POS path
 * without double stock deduction.
 */
class PrepaidDineInStage3Test extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    private Item $addonItem;

    private Customer $customer;

    private User $staff;

    private RestaurantTable $table;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-08-05 11:00:00', config('app.timezone')));

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);

        $category = Category::create([
            'name' => 'Dine In Cat 3',
            'slug' => 'dine-in-cat-3',
            'is_active' => true,
        ]);

        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Mixed Grill',
            'base_price' => 100.0,
            'sku' => 'DINEIN-MIX-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->addonItem = Item::create([
            'category_id' => $category->id,
            'name' => 'Extra Bread',
            'base_price' => 10.0,
            'sku' => 'DINEIN-BREAD-001',
            'is_active' => true,
            'is_available' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 5,
        ]);

        $this->customer = Customer::create([
            'name' => 'Same Bill Customer',
            'phone' => '+9607770400',
            'is_active' => true,
        ]);

        $ownerRole = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        $this->staff = User::create([
            'name' => 'Bill Staff',
            'email' => 'bill-staff@test.com',
            'password' => bcrypt('password'),
            'role_id' => $ownerRole->id,
            'pin_hash' => bcrypt('1234'),
            'is_active' => true,
        ]);

        $this->table = RestaurantTable::create([
            'name' => 'T3',
            'capacity' => 4,
            'status' => 'available',
            'is_active' => true,
        ]);

        foreach ([
            'online_ordering_enabled' => '1',
            'dine_in_preorder_enabled' => '1',
            'pickup_slots_enabled' => '0',
        ] as $key => $value) {
            SiteSetting::set($key, $value);
        }
        SiteSetting::bust();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** Create → pay → fire → seat: a prepaid dine-in mid-meal. */
    private function seatedPrepaidOrder(): Order
    {
        Sanctum::actingAs($this->customer, ['customer']);
        $res = $this->postJson('/api/customer/orders', [
            'type' => 'dine_in',
            'party_size' => 2,
            'pickup_slot_at' => Carbon::parse('2026-08-05 13:00', config('app.timezone'))->toIso8601String(),
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);
        $res->assertCreated();
        $order = Order::findOrFail($res->json('order.id'));

        // Simulate BML full payment.
        $order->update(['status' => 'pending', 'payment_status' => 'paid', 'paid_at' => now()]);
        \App\Models\Payment::create([
            'order_id' => $order->id,
            'method' => 'card',
            'amount' => (float) $order->total,
            'amount_laar' => (int) $order->total_laar,
            'status' => 'paid',
        ]);
        OrderPaid::dispatch(OrderPaidData::fromOrder($order->fresh(), true));

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson("/api/orders/{$order->id}/fire-to-kitchen")->assertOk();

        $reservation = Reservation::where('order_id', $order->id)->firstOrFail();
        Carbon::setTestNow(Carbon::parse('2026-08-05 13:00:00', config('app.timezone')));
        $this->postJson("/api/admin/reservations/{$reservation->id}/seat")->assertOk();

        return $order->fresh();
    }

    public function test_add_items_at_table_flips_paid_to_partial(): void
    {
        $order = $this->seatedPrepaidOrder();
        $paidLaar = (int) $order->total_laar;

        $res = $this->postJson("/api/tables/{$this->table->id}/orders/{$order->id}/items", [
            'items' => [['item_id' => $this->addonItem->id, 'name' => 'Extra Bread', 'quantity' => 2]],
            'print' => false,
        ]);
        $res->assertOk();

        $order->refresh();
        $this->assertSame('partial', $order->payment_status);
        $this->assertGreaterThan($paidLaar, (int) $order->total_laar);
        $this->assertSame(3, (int) $this->addonItem->fresh()->stock_quantity, 'Add-on deducts once at add time');
    }

    public function test_pos_item_edit_appends_on_prepaid_paid_order(): void
    {
        $order = $this->seatedPrepaidOrder();

        $res = $this->patchJson("/api/orders/{$order->id}/items", [
            'items' => [
                ['item_id' => $this->item->id, 'name' => 'Mixed Grill', 'quantity' => 1],
                ['item_id' => $this->addonItem->id, 'name' => 'Extra Bread', 'quantity' => 1],
            ],
            'reprint_kitchen' => false,
        ]);
        $res->assertOk();

        $order->refresh();
        $this->assertSame('partial', $order->payment_status);
        $this->assertSame(2, $order->items()->count());
    }

    public function test_reducing_below_paid_amount_is_rejected(): void
    {
        $order = $this->seatedPrepaidOrder();

        $res = $this->patchJson("/api/orders/{$order->id}/items", [
            'items' => [
                ['item_id' => $this->addonItem->id, 'name' => 'Extra Bread', 'quantity' => 1],
            ],
            'reprint_kitchen' => false,
        ]);

        $res->assertStatus(422);
        $order->refresh();
        $this->assertSame('paid', $order->payment_status);
        $this->assertSame(1, $order->items()->count(), 'Rejected edit must roll back');
    }

    public function test_non_prepaid_paid_orders_stay_locked(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);
        $order = app(\App\Services\OrderCreationService::class)->createFromPayload([
            'type' => 'takeaway',
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ], $this->staff);
        $order->update(['payment_status' => 'paid', 'paid_at' => now()]);

        $this->patchJson("/api/orders/{$order->id}/items", [
            'items' => [
                ['item_id' => $this->item->id, 'name' => 'Mixed Grill', 'quantity' => 2],
            ],
            'reprint_kitchen' => false,
        ])->assertStatus(422);
    }

    public function test_balance_settles_at_pos_without_double_deduction(): void
    {
        $order = $this->seatedPrepaidOrder();

        \App\Models\Shift::create([
            'user_id' => $this->staff->id,
            'opened_at' => now(),
            'opening_cash' => 0,
        ]);

        $this->postJson("/api/tables/{$this->table->id}/orders/{$order->id}/items", [
            'items' => [['item_id' => $this->addonItem->id, 'name' => 'Extra Bread', 'quantity' => 2]],
            'print' => false,
        ])->assertOk();

        $order->refresh();
        $balance = (float) $order->total - (float) \App\Models\Payment::where('order_id', $order->id)->sum('amount');
        $this->assertGreaterThan(0, $balance);

        $res = $this->postJson("/api/orders/{$order->id}/payments", [
            'payments' => [['method' => 'cash', 'amount' => $balance]],
            'print_receipt' => false,
        ]);
        $this->assertSame(200, $res->status(), 'Settle failed: ' . $res->getContent());

        $order->refresh();
        $this->assertSame('paid', $order->payment_status);
        // Add-on deducted exactly once despite the second OrderPaid dispatch.
        $this->assertSame(3, (int) $this->addonItem->fresh()->stock_quantity);
    }

    public function test_pay_link_allowed_once_balance_exists(): void
    {
        $order = $this->seatedPrepaidOrder();

        // Fully paid — pay link refused.
        $this->postJson("/api/orders/{$order->id}/send-pay-link")->assertStatus(422);

        $this->postJson("/api/tables/{$this->table->id}/orders/{$order->id}/items", [
            'items' => [['item_id' => $this->addonItem->id, 'name' => 'Extra Bread', 'quantity' => 1]],
            'print' => false,
        ])->assertOk();

        // Balance due — pay link may send (may still fail later on SMS creds,
        // but must not be the "already fully paid" 422).
        $res = $this->postJson("/api/orders/{$order->id}/send-pay-link");
        if ($res->status() === 422) {
            $this->assertStringNotContainsString('already fully paid', (string) $res->json('message'));
        }
    }

    public function test_prepaid_dine_in_stays_in_open_tickets_while_paid(): void
    {
        $order = $this->seatedPrepaidOrder();

        $list = $this->getJson('/api/orders?active_only=1&slim=1');
        $list->assertOk();
        $this->assertContains(
            $order->id,
            collect($list->json('data'))->pluck('id')->all(),
            'Prepaid dine-in must stay visible for fire/seat/add-ons',
        );
    }
}
