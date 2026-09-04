<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\RestaurantTable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A QR on the table, so the people sitting at it can order from their phones.
 *
 * The token is the whole security story. A QR reading `?table=4` would invite
 * `?table=5` — someone at table 4 sending their order, and the kitchen chit, to
 * another party's table, and anyone printing the whole floor by counting. So
 * the table is decided by an unguessable token the server resolves, never by an
 * id the client sends.
 */
class TableQrOrderingTest extends TestCase
{
    use RefreshDatabase;

    private function table(string $name = 'T4'): RestaurantTable
    {
        return RestaurantTable::create([
            'name' => $name, 'capacity' => 4, 'status' => 'available', 'is_active' => true,
        ]);
    }

    private function sellableItem(): Item
    {
        return $this->makeItem(false, 0, ['base_price' => 25]);
    }

    private function actAsCustomer(): Customer
    {
        $customer = Customer::create([
            'name' => 'Aisha', 'phone' => '7778881', 'is_active' => true,
        ]);
        Sanctum::actingAs($customer, ['customer']);

        return $customer;
    }

    public function test_every_table_gets_a_token_that_is_not_its_id(): void
    {
        $table = $this->table();

        $token = $table->ensureQrToken();
        $other = $this->table('T5')->ensureQrToken();

        $this->assertSame(24, strlen($token));
        // Not derived from the id, so a card cannot be guessed by counting.
        $this->assertNotSame((string) $table->id, $token);
        $this->assertNotSame($token, $other);
        // Asking twice does not mint twice — the printed card stays valid.
        $this->assertSame($token, $table->fresh()->ensureQrToken());
    }

    public function test_a_scan_says_which_table_it_is_and_nothing_else(): void
    {
        // Public, because the phone has not logged in yet. A guessed token must
        // not reveal occupancy, an open check, or an id to iterate.
        $table = $this->table('T7');
        $token = $table->ensureQrToken();

        $res = $this->getJson("/api/tables/qr/{$token}")->assertOk();

        $this->assertSame('T7', $res->json('table.name'));
        $this->assertNull($res->json('table.id'));
        $this->assertNull($res->json('table.status'));
    }

    public function test_an_unknown_token_is_refused(): void
    {
        $this->getJson('/api/tables/qr/' . str_repeat('z', 24))->assertStatus(404);
    }

    public function test_an_inactive_table_stops_answering(): void
    {
        // Taking a table out of service must take its card out of service too.
        $table = $this->table();
        $token = $table->ensureQrToken();
        $table->update(['is_active' => false]);

        $this->getJson("/api/tables/qr/{$token}")->assertStatus(404);
    }

    public function test_an_order_placed_from_the_table_lands_on_that_table(): void
    {
        $table = $this->table();
        $token = $table->ensureQrToken();
        $item = $this->sellableItem();
        $this->actAsCustomer();

        $res = $this->postJson('/api/customer/orders', [
            'table_token' => $token,
            'items' => [['item_id' => $item->id, 'quantity' => 2]],
        ]);

        $res->assertSuccessful();
        $order = Order::latest('id')->firstOrFail();
        $this->assertSame($table->id, (int) $order->restaurant_table_id);
        $this->assertSame('dine_in', $order->type);
    }

    public function test_a_seated_order_needs_no_arrival_time_or_party_size(): void
    {
        /*
         * The existing dine_in is a PRE-order: pay now, arrive at a slot, party
         * of N. Someone who has just scanned the card on table 4 is already at
         * table 4, so both are questions with no answer.
         */
        $token = $this->table()->ensureQrToken();
        $item = $this->sellableItem();
        $this->actAsCustomer();

        $this->postJson('/api/customer/orders', [
            'type' => 'dine_in',
            'table_token' => $token,
            'items' => [['item_id' => $item->id, 'quantity' => 1]],
        ])->assertSuccessful();

        $this->assertNull(Order::latest('id')->firstOrFail()->pickup_slot_at);
    }

    public function test_a_round_ordered_while_the_last_is_unpaid_is_refused_in_plain_words(): void
    {
        /*
         * One open check per table is an existing invariant — it is what stops
         * a walk-in being seated on top of somebody else's bill — and it holds
         * for QR orders too. What must not hold is the staff-facing wording:
         * a guest reading "Table already has an open order" learns nothing.
         */
        $table = $this->table();
        $token = $table->ensureQrToken();
        $item = $this->sellableItem();
        $this->actAsCustomer();

        $this->postJson('/api/customer/orders', [
            'table_token' => $token,
            'items' => [['item_id' => $item->id, 'quantity' => 1]],
        ])->assertSuccessful();

        $second = $this->postJson('/api/customer/orders', [
            'table_token' => $token,
            'items' => [['item_id' => $item->id, 'quantity' => 1]],
        ])->assertStatus(422);

        $this->assertStringContainsString('Finish paying', (string) $second->json('message'));
        $this->assertSame(1, Order::where('restaurant_table_id', $table->id)->count());
    }

    public function test_the_next_round_works_once_the_last_one_is_settled(): void
    {
        // A settled order no longer owns the seat, so the table can order again.
        $table = $this->table();
        $token = $table->ensureQrToken();
        $item = $this->sellableItem();
        $this->actAsCustomer();

        $this->postJson('/api/customer/orders', [
            'table_token' => $token,
            'items' => [['item_id' => $item->id, 'quantity' => 1]],
        ])->assertSuccessful();
        // Settled the way a payment settles it. The status machine only allows
        // payment_pending → paid, and `paid` is not a seat-owning status, so
        // the table is free for the next round.
        Order::latest('id')->firstOrFail()->update(['status' => 'paid']);

        $this->postJson('/api/customer/orders', [
            'table_token' => $token,
            'items' => [['item_id' => $item->id, 'quantity' => 2]],
        ])->assertSuccessful();

        $this->assertSame(2, Order::where('restaurant_table_id', $table->id)->count());
    }

    public function test_a_pre_order_without_a_table_still_needs_both(): void
    {
        // The relaxation is for a scan, not for dine-in generally.
        $item = $this->sellableItem();
        $this->actAsCustomer();

        $this->postJson('/api/customer/orders', [
            'type' => 'dine_in',
            'items' => [['item_id' => $item->id, 'quantity' => 1]],
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['pickup_slot_at', 'party_size']);
    }

    public function test_a_bad_token_is_refused_rather_than_dropped(): void
    {
        // A chit that silently loses its table is worse than one not accepted.
        $item = $this->sellableItem();
        $this->actAsCustomer();

        $this->postJson('/api/customer/orders', [
            'table_token' => str_repeat('q', 24),
            'items' => [['item_id' => $item->id, 'quantity' => 1]],
        ])->assertStatus(422);

        $this->assertSame(0, Order::count());
    }

    public function test_a_rotated_token_stops_working_immediately(): void
    {
        // The reason rotation exists: a card is photographed, or walks off.
        $table = $this->table();
        $old = $table->ensureQrToken();
        $new = $table->rotateQrToken();

        $this->assertNotSame($old, $new);
        $this->getJson("/api/tables/qr/{$old}")->assertStatus(404);
        $this->getJson("/api/tables/qr/{$new}")->assertOk();
    }

    public function test_a_customer_cannot_choose_a_table_by_id(): void
    {
        /*
         * The point of the token. `restaurant_table_id` is not in the customer
         * request's rules, so a client sending one is ignored — the order is a
         * plain pickup rather than an order sent to somebody else's table.
         */
        $victim = $this->table('T9');
        $item = $this->sellableItem();
        $this->actAsCustomer();

        $this->postJson('/api/customer/orders', [
            'restaurant_table_id' => $victim->id,
            'items' => [['item_id' => $item->id, 'quantity' => 1]],
        ])->assertSuccessful();

        $this->assertNull(Order::latest('id')->firstOrFail()->restaurant_table_id);
    }
}
