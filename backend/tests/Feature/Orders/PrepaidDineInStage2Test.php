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
 * Prepaid dine-in Stage 2: the table guarantee.
 * A paid order carries a reservation; walk-ins cannot take the held table;
 * Seat claims the table for the prepaid bill.
 */
class PrepaidDineInStage2Test extends TestCase
{
    use RefreshDatabase;

    private Item $item;

    private Customer $customer;

    private User $staff;

    private RestaurantTable $table;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-08-05 11:00:00', config('app.timezone')));

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);

        $category = Category::create([
            'name' => 'Dine In Cat 2',
            'slug' => 'dine-in-cat-2',
            'is_active' => true,
        ]);

        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Grill Feast',
            'base_price' => 80.0,
            'sku' => 'DINEIN-FEAST-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->customer = Customer::create([
            'name' => 'Table Customer',
            'phone' => '+9607770300',
            'is_active' => true,
        ]);

        $ownerRole = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        $this->staff = User::create([
            'name' => 'Floor Staff',
            'email' => 'floor-staff@test.com',
            'password' => bcrypt('password'),
            'role_id' => $ownerRole->id,
            'pin_hash' => bcrypt('1234'),
            'is_active' => true,
        ]);

        $this->table = RestaurantTable::create([
            'name' => 'T1',
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

    private function placeDineInOrder(string $arrival = '13:00'): Order
    {
        Sanctum::actingAs($this->customer, ['customer']);
        $res = $this->postJson('/api/customer/orders', [
            'type' => 'dine_in',
            'party_size' => 2,
            'pickup_slot_at' => Carbon::parse("2026-08-05 {$arrival}", config('app.timezone'))->toIso8601String(),
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);
        $res->assertCreated();

        return Order::findOrFail($res->json('order.id'));
    }

    private function markPaid(Order $order): void
    {
        $order->update(['status' => 'pending', 'payment_status' => 'paid', 'paid_at' => now()]);
        OrderPaid::dispatch(OrderPaidData::fromOrder($order->fresh(), true));
    }

    public function test_order_creates_pending_reservation_with_assigned_table(): void
    {
        $order = $this->placeDineInOrder();

        $reservation = Reservation::where('order_id', $order->id)->firstOrFail();
        $this->assertSame('pending', $reservation->status);
        $this->assertSame($this->table->id, (int) $reservation->table_id);
        $this->assertSame(2, (int) $reservation->party_size);
        $this->assertSame('13:00:00', (string) $reservation->time_slot);
    }

    public function test_no_free_table_fails_checkout_before_payment(): void
    {
        // Party bigger than every table's capacity → no table assignable.
        Sanctum::actingAs($this->customer, ['customer']);
        $res = $this->postJson('/api/customer/orders', [
            'type' => 'dine_in',
            'party_size' => 10,
            'pickup_slot_at' => Carbon::parse('2026-08-05 13:00', config('app.timezone'))->toIso8601String(),
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ]);

        $res->assertStatus(422);
        $this->assertSame(0, Order::count(), 'Order must roll back when no table can be held');
        $this->assertSame(0, Reservation::count());
    }

    public function test_payment_confirms_reservation(): void
    {
        $order = $this->placeDineInOrder();
        $this->markPaid($order);

        $reservation = Reservation::where('order_id', $order->id)->firstOrFail();
        $this->assertSame('confirmed', $reservation->status);
    }

    public function test_cancelled_order_releases_the_hold(): void
    {
        $order = $this->placeDineInOrder();
        $this->markPaid($order);

        \App\Domains\Orders\Events\OrderCancelled::dispatch(
            \App\Domains\Orders\DTOs\OrderCancelledData::fromOrder($order->fresh()),
        );

        $this->assertSame('cancelled', Reservation::where('order_id', $order->id)->value('status'));
    }

    public function test_walk_in_cannot_claim_held_table_inside_window(): void
    {
        $order = $this->placeDineInOrder('13:00');
        $this->markPaid($order);

        // 12:30 — inside the 60-minute pre-slot hold.
        Carbon::setTestNow(Carbon::parse('2026-08-05 12:30:00', config('app.timezone')));

        $walkIn = Order::create([
            'order_number' => 'WALKIN-1',
            'type' => 'dine_in',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'subtotal' => 0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 0,
        ]);

        try {
            RestaurantTable::claimForOrder($this->table->id, (int) $walkIn->id);
            $this->fail('Expected 422 for a walk-in claiming a held table');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertStringContainsString('reserved', $e->getMessage());
        }
    }

    public function test_walk_in_allowed_outside_hold_window(): void
    {
        $order = $this->placeDineInOrder('13:00');
        $this->markPaid($order);

        // 11:30 — more than 60 minutes before the booking.
        Carbon::setTestNow(Carbon::parse('2026-08-05 11:30:00', config('app.timezone')));

        $walkIn = Order::create([
            'order_number' => 'WALKIN-2',
            'type' => 'dine_in',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'subtotal' => 0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 0,
        ]);

        RestaurantTable::claimForOrder($this->table->id, (int) $walkIn->id);
        $this->assertSame('occupied', $this->table->fresh()->status);
    }

    public function test_seat_claims_table_for_prepaid_order(): void
    {
        $order = $this->placeDineInOrder('13:00');
        $this->markPaid($order);
        $reservation = Reservation::where('order_id', $order->id)->firstOrFail();

        Carbon::setTestNow(Carbon::parse('2026-08-05 12:55:00', config('app.timezone')));
        Sanctum::actingAs($this->staff, ['staff']);

        $res = $this->postJson("/api/admin/reservations/{$reservation->id}/seat");
        $res->assertOk();
        $res->assertJsonPath('reservation.status', 'seated');
        $res->assertJsonPath('order_id', $order->id);

        $this->assertSame($this->table->id, (int) $order->fresh()->restaurant_table_id);
        $this->assertSame('occupied', $this->table->fresh()->status);
    }

    public function test_seat_rejects_unconfirmed_reservation(): void
    {
        $order = $this->placeDineInOrder('13:00');
        $reservation = Reservation::where('order_id', $order->id)->firstOrFail();
        $this->assertSame('pending', $reservation->status);

        Sanctum::actingAs($this->staff, ['staff']);
        $this->postJson("/api/admin/reservations/{$reservation->id}/seat")->assertStatus(422);
    }

    public function test_customer_order_detail_includes_reservation(): void
    {
        $order = $this->placeDineInOrder('13:00');
        $this->markPaid($order);

        Sanctum::actingAs($this->customer, ['customer']);
        $res = $this->getJson("/api/customer/orders/{$order->id}");
        $res->assertOk();
        $res->assertJsonPath('order.reservation.status', 'confirmed');
        $res->assertJsonPath('order.reservation.time_slot', '13:00');
        $res->assertJsonPath('order.reservation.table.name', 'T1');
    }
}
