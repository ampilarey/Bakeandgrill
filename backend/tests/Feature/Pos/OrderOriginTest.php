<?php

declare(strict_types=1);

namespace Tests\Feature\Pos;

use App\Models\Category;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Telling a customer's order apart from one a cashier rang up.
 *
 * There is no `source` column and **`type` is not one**. A cashier picking
 * "Pickup" on the till produces type `online_pickup` (mapPosOrderType in
 * apps/pos-web), so the POS "Online" tab — filtering on
 * `whereIn('type', ['online_pickup', 'delivery'])` — listed every staff
 * pickup and every phoned-in delivery under a heading that reads "Online
 * orders — pickup and delivery from the ordering app".
 *
 * The signal is `user_id`: OrderCreationService stamps the cashier on
 * anything rung on a till; the customer path never sets it.
 *
 * The pre-existing coverage passed against the broken filter because its
 * online fixtures happened to have `user_id` null *and* its staff fixture was
 * a `dine_in`, which type-matching excluded anyway. Nothing exercised a staff
 * ticket carrying an online-looking type — which is the whole bug. That case
 * is the first test here.
 */
class OrderOriginTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );

        $this->cashier = User::create([
            'name' => 'Cashier',
            'email' => 'cashier@origin-test.mv',
            'password' => Hash::make('secret'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('8317'),
            'is_active' => true,
        ]);

        $category = Category::create([
            'name' => 'Shorteats',
            'slug' => 'shorteats',
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Bajiya',
            'base_price' => 5,
            'sku' => 'ORIGIN-1',
            'is_active' => true,
            'is_available' => true,
        ]);
    }

    private function openShift(): void
    {
        Shift::create([
            'user_id' => $this->cashier->id,
            'opened_at' => now(),
            'opening_cash' => 0,
        ]);
    }

    /** A ticket rung on the till, carrying a type that *looks* online. */
    private function staffRungPickup(): Order
    {
        Sanctum::actingAs($this->cashier, ['staff']);
        $this->openShift();

        $response = $this->postJson('/api/orders', [
            // Exactly what the POS sends when the cashier picks "Pickup".
            'type' => 'online_pickup',
            'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
        ])->assertCreated();

        return Order::findOrFail((int) $response->json('order.id'));
    }

    public function test_a_staff_rung_pickup_is_not_listed_as_an_online_order(): void
    {
        // The bug, stated plainly. type is online_pickup either way; only
        // user_id separates them.
        $staffTicket = $this->staffRungPickup();
        $this->assertSame('online_pickup', $staffTicket->type);
        $this->assertNotNull($staffTicket->user_id, 'a till ticket carries its cashier');

        $customerOrder = Order::factory()->onlinePickup()->pending()->create([
            'user_id' => null,
            'order_number' => 'BG-APP-001',
        ]);

        Sanctum::actingAs($this->cashier, ['staff']);
        $ids = collect(
            $this->getJson('/api/orders?active_only=1&online_only=1')->assertOk()->json('data'),
        )->pluck('id')->all();

        $this->assertContains($customerOrder->id, $ids, 'the app order belongs here');
        $this->assertNotContains($staffTicket->id, $ids, 'the till ticket does not');
    }

    public function test_a_staff_rung_delivery_is_not_listed_as_an_online_order(): void
    {
        // Same shape as pickup: a phoned-in delivery is type `delivery` too.
        $staffDelivery = Order::factory()->create([
            'user_id' => $this->cashier->id,
            'order_number' => 'BG-PHONE-001',
            'type' => 'delivery',
            'status' => 'pending',
            'payment_status' => 'unpaid',
        ]);

        Sanctum::actingAs($this->cashier, ['staff']);
        $ids = collect(
            $this->getJson('/api/orders?active_only=1&online_only=1')->assertOk()->json('data'),
        )->pluck('id')->all();

        $this->assertNotContains($staffDelivery->id, $ids);
    }

    public function test_a_dine_in_order_placed_in_the_app_counts_as_online(): void
    {
        // The old filter only matched online_pickup and delivery, so a dine-in
        // order placed by a customer was invisible in the Online tab — while
        // the active-orders query elsewhere in the same controller already
        // treated `dine_in` + null user_id as a prepaid customer order.
        $appDineIn = Order::factory()->create([
            'user_id' => null,
            'order_number' => 'BG-APP-DINEIN',
            'type' => 'dine_in',
            'status' => 'pending',
            'payment_status' => 'paid',
        ]);

        Sanctum::actingAs($this->cashier, ['staff']);
        $ids = collect(
            $this->getJson('/api/orders?active_only=1&online_only=1')->assertOk()->json('data'),
        )->pluck('id')->all();

        $this->assertContains($appDineIn->id, $ids);
    }

    public function test_staff_only_is_the_exact_complement(): void
    {
        // Every active order is one or the other, never both and never
        // neither — otherwise a ticket can hide from both views.
        $staffTicket = $this->staffRungPickup();
        $customerOrder = Order::factory()->onlinePickup()->pending()->create([
            'user_id' => null,
            'order_number' => 'BG-APP-002',
        ]);

        Sanctum::actingAs($this->cashier, ['staff']);

        $all = collect($this->getJson('/api/orders?active_only=1')->assertOk()->json('data'))
            ->pluck('id')->sort()->values()->all();
        $online = collect($this->getJson('/api/orders?active_only=1&online_only=1')->assertOk()->json('data'))
            ->pluck('id')->all();
        $staff = collect($this->getJson('/api/orders?active_only=1&staff_only=1')->assertOk()->json('data'))
            ->pluck('id')->all();

        $this->assertContains($customerOrder->id, $online);
        $this->assertContains($staffTicket->id, $staff);
        $this->assertSame([], array_intersect($online, $staff), 'no order is in both');
        $this->assertSame(
            $all,
            collect($online)->merge($staff)->sort()->values()->all(),
            'together they account for every active order',
        );
    }

    public function test_the_payload_says_which_it_is_so_the_pos_need_not_guess(): void
    {
        // The POS worked this out from `type` plus a nullable relation, which
        // is how the list filter and the row label came to disagree.
        $staffTicket = $this->staffRungPickup();
        $customerOrder = Order::factory()->onlinePickup()->pending()->create([
            'user_id' => null,
            'order_number' => 'BG-APP-003',
        ]);

        Sanctum::actingAs($this->cashier, ['staff']);
        $rows = collect($this->getJson('/api/orders?active_only=1')->assertOk()->json('data'))
            ->keyBy('id');

        $this->assertFalse($rows[$staffTicket->id]['is_customer_placed']);
        $this->assertTrue($rows[$customerOrder->id]['is_customer_placed']);
    }
}
