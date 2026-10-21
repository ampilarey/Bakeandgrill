<?php

declare(strict_types=1);

namespace Tests\Feature\Tables;

use App\Domains\Orders\Support\NumberStands;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Printing\Services\PrintJobService;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\RestaurantTable;
use App\Models\Role;
use App\Models\Shift;
use App\Models\User;
use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Number stands for self-seating dine-in (owner, 2026-10-22): a till dine-in
 * ticket with no table gets the lowest free number automatically, a number
 * taken meanwhile gives way to the next one, the number is held through
 * payment until the order is served (or 90 minutes), and the slip and the
 * receipt name it.
 */
class NumberStandsTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $staff;

    private Device $device;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'is_active' => true]);
        PermissionCatalogSync::sync();

        $make = fn (string $role, string $email) => User::create([
            'name' => ucfirst($role),
            'email' => $email,
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', $role)->firstOrFail()->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->owner = $make('owner', 'owner@stands.test');
        $this->staff = $make('staff', 'staff@stands.test');

        $this->device = Device::create(['name' => 'Stands POS', 'identifier' => 'STANDS-POS', 'type' => 'pos', 'is_active' => true]);
        $category = Category::create(['name' => 'Stand Food', 'slug' => 'stand-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id, 'name' => 'Stand Item', 'base_price' => 25.0, 'sku' => 'STD-001',
            'is_active' => true, 'is_available' => true,
        ]);
    }

    // ── helpers ───────────────────────────────────────────────────────

    private function asStaff(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);
        if (Shift::where('user_id', $this->staff->id)->whereNull('closed_at')->doesntExist()) {
            $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();
        }
    }

    private function setStands(int $count): void
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $this->putJson('/api/tables/stands', ['count' => $count])->assertOk();
    }

    /** @return array<string, array<string, mixed>> tables keyed by name */
    private function tables(): array
    {
        Sanctum::actingAs($this->owner, ['staff']);
        $rows = $this->getJson('/api/tables')->assertOk()->json('tables');

        return collect($rows)->keyBy('name')->all();
    }

    private function standId(int $n): int
    {
        return (int) RestaurantTable::query()->where('kind', 'stand')->where('name', NumberStands::NAME_PREFIX . $n)->value('id');
    }

    /** @param array<string, mixed> $extra */
    private function tillOrder(array $extra = []): TestResponse
    {
        $this->asStaff();

        return $this->withHeader('X-Device-Identifier', $this->device->identifier)->postJson('/api/orders', array_merge([
            'type' => 'dine_in',
            'device_identifier' => $this->device->identifier,
            'print' => false,
            'items' => [['item_id' => $this->item->id, 'name' => $this->item->name, 'quantity' => 1]],
        ], $extra));
    }

    private function payCash(int $orderId): void
    {
        $this->asStaff();
        $order = Order::findOrFail($orderId);
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$orderId}/payments", [
                'payments' => [['method' => 'cash', 'amount' => (float) $order->total]],
                'print_receipt' => false,
            ])
            ->assertOk();
        DeferAfterResponse::flushTestingCallbacks();
    }

    // ── tests ─────────────────────────────────────────────────────────

    public function test_admin_sets_how_many_number_stands_and_the_rest_retire(): void
    {
        $this->setStands(3);
        $tables = $this->tables();
        foreach ([1, 2, 3] as $n) {
            $this->assertSame('stand', $tables['No. ' . $n]['kind']);
            $this->assertSame('available', $tables['No. ' . $n]['status']);
        }

        $this->setStands(2);
        $this->assertFalse((bool) RestaurantTable::whereKey($this->standId(3))->value('is_active'));
        $this->assertSame(2, NumberStands::activeCount());
        Sanctum::actingAs($this->owner, ['staff']);
        $this->assertCount(2, collect($this->getJson('/api/tables?active_only=1')->json('tables'))->where('kind', 'stand'));

        // A stand has no QR card: it is handed over at the counter.
        $this->getJson('/api/tables/' . $this->standId(1) . '/qr')->assertUnprocessable();
        $this->putJson('/api/tables/stands', ['count' => 500])->assertUnprocessable();
    }

    public function test_a_till_dine_in_ticket_with_no_table_gets_the_lowest_free_number(): void
    {
        $this->setStands(3);

        $first = $this->tillOrder()->assertCreated();
        $this->assertSame($this->standId(1), (int) $first->json('order.restaurant_table_id'));
        $second = $this->tillOrder()->assertCreated();
        $this->assertSame($this->standId(2), (int) $second->json('order.restaurant_table_id'));

        $tables = $this->tables();
        $this->assertSame((int) $first->json('order.id'), (int) $tables['No. 1']['current_order_id']);
        $this->assertSame('occupied', $tables['No. 1']['status']);
        $this->assertSame('available', $tables['No. 3']['status']);

        // A takeaway never takes a number.
        $takeaway = $this->tillOrder(['type' => 'takeaway'])->assertCreated();
        $this->assertNull($takeaway->json('order.restaurant_table_id'));

        // With every number taken, the ticket goes without one, as before.
        $this->tillOrder()->assertCreated();
        $none = $this->tillOrder()->assertCreated();
        $this->assertNull($none->json('order.restaurant_table_id'));
    }

    public function test_a_number_taken_meanwhile_gives_way_but_a_real_table_in_use_is_refused(): void
    {
        $this->setStands(2);
        $table = RestaurantTable::create(['name' => 'T1', 'capacity' => 4, 'status' => 'available', 'is_active' => true]);

        $first = $this->tillOrder(['restaurant_table_id' => $this->standId(1)])->assertCreated();
        $this->assertSame($this->standId(1), (int) $first->json('order.restaurant_table_id'));
        // Another till picked No. 1 a moment ago: the next free number, not a refusal.
        $second = $this->tillOrder(['restaurant_table_id' => $this->standId(1)])->assertCreated();
        $this->assertSame($this->standId(2), (int) $second->json('order.restaurant_table_id'));

        // A real table the cashier chose stays as chosen, and one in use is refused.
        $seated = $this->tillOrder(['restaurant_table_id' => $table->id])->assertCreated();
        $this->assertSame($table->id, (int) $seated->json('order.restaurant_table_id'));
        $this->tillOrder(['restaurant_table_id' => $table->id])->assertUnprocessable();
    }

    public function test_a_number_is_held_through_payment_until_served_while_a_table_frees_at_payment(): void
    {
        $this->setStands(2);
        $table = RestaurantTable::create(['name' => 'T1', 'capacity' => 4, 'status' => 'available', 'is_active' => true]);

        $numbered = (int) $this->tillOrder()->assertCreated()->json('order.id');
        $seated = (int) $this->tillOrder(['restaurant_table_id' => $table->id])->assertCreated()->json('order.id');
        $this->payCash($numbered);
        $this->payCash($seated);

        $this->assertSame('paid', Order::findOrFail($numbered)->status);
        $this->assertSame($this->standId(1), (int) Order::findOrFail($numbered)->restaurant_table_id, 'the number stays on a paid order');
        $this->assertNull(Order::findOrFail($seated)->restaurant_table_id, 'a real table frees at payment as before');
        $tables = $this->tables();
        $this->assertSame('occupied', $tables['No. 1']['status']);
        $this->assertSame($numbered, (int) $tables['No. 1']['current_order_id']);
        $this->assertSame('available', $tables['T1']['status']);

        // Served on the kitchen screen: the number is free again, the order keeps it for its record.
        Order::whereKey($numbered)->update(['status' => 'ready']);
        Sanctum::actingAs($this->owner, ['staff']);
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/kds/orders/{$numbered}/bump")->assertOk();
        $this->assertSame('completed', Order::findOrFail($numbered)->status);
        $tables = $this->tables();
        $this->assertSame('available', $tables['No. 1']['status']);
        $this->assertNull($tables['No. 1']['current_order_id']);
        // The next ticket gets No. 1 again.
        $this->assertSame($this->standId(1), (int) $this->tillOrder()->assertCreated()->json('order.restaurant_table_id'));
    }

    public function test_a_paid_number_lets_go_after_ninety_minutes_or_when_freed_by_hand(): void
    {
        $this->setStands(2);
        $first = (int) $this->tillOrder()->assertCreated()->json('order.id');
        $this->payCash($first);
        $this->assertSame('occupied', $this->tables()['No. 1']['status']);

        $this->travel(91)->minutes();
        $this->assertSame('available', $this->tables()['No. 1']['status']);
        $this->assertSame($this->standId(1), (int) $this->tillOrder()->assertCreated()->json('order.restaurant_table_id'));
        $this->travelBack();

        // Free number by hand: the paid order is let go and the number is free at once.
        $second = (int) $this->tillOrder()->assertCreated()->json('order.id');
        $this->assertSame($this->standId(2), (int) Order::findOrFail($second)->restaurant_table_id);
        $this->payCash($second);
        Sanctum::actingAs($this->owner, ['staff']);
        $this->postJson('/api/tables/' . $this->standId(2) . '/close')->assertOk()->assertJsonPath('table.status', 'available');
        $this->assertNull(Order::findOrFail($second)->restaurant_table_id);
        $this->assertSame('available', $this->tables()['No. 2']['status']);
    }

    public function test_a_saved_ticket_switched_to_dine_in_gets_a_number_and_keeps_it_on_the_next_save(): void
    {
        $this->setStands(2);
        $orderId = (int) $this->tillOrder(['type' => 'takeaway'])->assertCreated()->json('order.id');
        $line = [['item_id' => $this->item->id, 'name' => $this->item->name, 'quantity' => 1]];

        $this->asStaff();
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->patchJson("/api/orders/{$orderId}/items", ['items' => $line, 'reprint_kitchen' => false, 'type' => 'dine_in', 'restaurant_table_id' => null])
            ->assertOk()
            ->assertJsonPath('order.restaurant_table_id', $this->standId(1));

        // Saving again with its own number keeps it: the ticket's own number counts as free.
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->patchJson("/api/orders/{$orderId}/items", ['items' => $line, 'reprint_kitchen' => false, 'restaurant_table_id' => $this->standId(1)])
            ->assertOk()
            ->assertJsonPath('order.restaurant_table_id', $this->standId(1));
        $this->assertSame('occupied', $this->tables()['No. 1']['status']);
        $this->assertSame('available', $this->tables()['No. 2']['status']);
    }

    public function test_the_kitchen_slip_and_the_receipt_name_the_number(): void
    {
        $this->setStands(1);
        $order = Order::findOrFail((int) $this->tillOrder()->assertCreated()->json('order.id'));
        $this->assertSame('No. 1', PrintJobService::seatLine($order));
        $this->assertSame('No. 1', PrintJobService::seatLine($order, withTicketName: false));

        $order->update(['ticket_name' => 'Aisha']);
        $this->assertSame('No. 1 · Aisha', PrintJobService::seatLine($order->fresh()));
        $this->assertSame('No. 1', PrintJobService::seatLine($order->fresh(), withTicketName: false));

        $order->update(['ticket_name' => 'Aisha · No. 1']);
        $this->assertSame('No. 1', PrintJobService::seatLine($order->fresh()), 'a name that already carries the number is not doubled');

        $takeaway = Order::findOrFail((int) $this->tillOrder(['type' => 'takeaway', 'ticket_name' => 'Ahmed'])->assertCreated()->json('order.id'));
        $this->assertSame('Ahmed', PrintJobService::seatLine($takeaway));
        $this->assertNull(PrintJobService::seatLine($takeaway, withTicketName: false));
    }

    public function test_a_dine_in_ticket_with_no_seat_cannot_be_paid_while_a_table_or_number_is_free(): void
    {
        // No stands, one table: a ticket with no table is refused at payment.
        $table = RestaurantTable::create(['name' => 'T1', 'capacity' => 4, 'status' => 'available', 'is_active' => true]);
        $bare = (int) $this->tillOrder()->assertCreated()->json('order.id');
        $this->assertNull(Order::findOrFail($bare)->restaurant_table_id);
        $this->asStaff();
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$bare}/payments", ['payments' => [['method' => 'cash', 'amount' => (float) Order::findOrFail($bare)->total]], 'print_receipt' => false])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Choose a table or a number for this ticket before taking payment.');

        // With the only table in use, the bare ticket may be paid.
        $this->tillOrder(['restaurant_table_id' => $table->id])->assertCreated();
        $this->payCash($bare);
        $this->assertSame('paid', Order::findOrFail($bare)->status);

        // A takeaway never needs a seat.
        $takeaway = (int) $this->tillOrder(['type' => 'takeaway'])->assertCreated()->json('order.id');
        $this->payCash($takeaway);
        $this->assertSame('paid', Order::findOrFail($takeaway)->status);

        // A free number counts as a free seat too: a ticket whose number was
        // taken off it is refused until it has one again.
        $this->setStands(1);
        $numbered = (int) $this->tillOrder()->assertCreated()->json('order.id');
        Order::whereKey($numbered)->update(['restaurant_table_id' => null]);
        $this->asStaff();
        $this->withHeader('X-Device-Identifier', $this->device->identifier)
            ->postJson("/api/orders/{$numbered}/payments", ['payments' => [['method' => 'cash', 'amount' => (float) Order::findOrFail($numbered)->total]], 'print_receipt' => false])
            ->assertUnprocessable();
    }
}
