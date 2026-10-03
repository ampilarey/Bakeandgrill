<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Device;
use App\Models\Order;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-10-03: "add admin POS to view all receipts, live and paid
 * ones also, with filtering option." The till's Receipts pane gets an "All
 * tills" view for whoever holds pos.view_all_station_orders: every
 * cashier's orders, narrowed by live / paid, cashier, till and dates. A
 * cashier without it still sees only their own.
 */
class ReceiptsAllTillsTest extends TestCase
{
    use RefreshDatabase;

    private User $hassan;

    private User $aisha;

    private Device $front;

    private Device $back;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->hassan = $this->makeStaff('staff', ['name' => 'Hassan']);
        $this->aisha = $this->makeStaff('staff', ['name' => 'Aisha', 'phone' => '+9607770011']);
        $this->front = Device::create(['name' => 'Front till', 'identifier' => 'pos-front', 'type' => 'pos', 'is_active' => true, 'status' => 'approved']);
        $this->back = Device::create(['name' => 'Back till', 'identifier' => 'pos-back', 'type' => 'pos', 'is_active' => true, 'status' => 'approved']);
        Device::create(['name' => 'Kitchen screen', 'identifier' => 'kds-1', 'type' => 'kds', 'is_active' => true, 'status' => 'approved']);

        // Hassan: one paid, one live (cooking, unpaid). Aisha: one paid on the back till, one cancelled.
        Order::factory()->create(['order_number' => 'H-PAID', 'user_id' => $this->hassan->id, 'device_id' => $this->front->id, 'status' => 'completed', 'payment_status' => 'paid', 'paid_at' => now()]);
        Order::factory()->create(['order_number' => 'H-LIVE', 'user_id' => $this->hassan->id, 'device_id' => $this->front->id, 'status' => 'preparing', 'payment_status' => 'unpaid']);
        Order::factory()->create(['order_number' => 'A-PAID', 'user_id' => $this->aisha->id, 'device_id' => $this->back->id, 'status' => 'completed', 'payment_status' => 'paid', 'paid_at' => now()]);
        Order::factory()->create(['order_number' => 'A-CANCELLED', 'user_id' => $this->aisha->id, 'device_id' => $this->back->id, 'status' => 'cancelled', 'payment_status' => 'paid']);
    }

    private function numbers(array $query): array
    {
        $rows = $this->getJson('/api/orders?' . http_build_query($query))->assertOk()->json('data');
        $numbers = array_column($rows, 'order_number');
        sort($numbers);

        return $numbers;
    }

    public function test_a_manager_sees_every_till_and_can_narrow_it(): void
    {
        Sanctum::actingAs($this->makeManager(['phone' => '+9607770012']), ['staff']);

        $this->assertSame(['A-CANCELLED', 'A-PAID', 'H-LIVE', 'H-PAID'], $this->numbers([]));
        $this->assertSame(['H-LIVE'], $this->numbers(['unpaid_only' => 1]), 'live = unpaid and still in progress');
        $this->assertSame(['A-PAID', 'H-PAID'], $this->numbers(['paid_only' => 1]), 'paid excludes the cancelled order even though it was paid');
        $this->assertSame(['A-CANCELLED', 'A-PAID'], $this->numbers(['user_id' => $this->aisha->id]));
        $this->assertSame(['H-LIVE', 'H-PAID'], $this->numbers(['device_id' => $this->front->id]));
        $this->assertSame(['A-PAID'], $this->numbers(['paid_only' => 1, 'device_id' => $this->back->id]));
        $this->assertSame([], $this->numbers(['date_from' => now()->addDay()->toDateString()]));

        $row = collect($this->getJson('/api/orders?paid_only=1')->json('data'))->firstWhere('order_number', 'A-PAID');
        $this->assertSame('Aisha', $row['user']['name'], 'each row names its cashier');
        $this->assertSame('Back till', $row['device']['name'], 'and its till');
    }

    public function test_a_cashier_sees_only_their_open_shift_and_cannot_use_the_filters_endpoint(): void
    {
        // Owner, 2026-10-03: "if the shift is closed he should not see the
        // receipts, and when a new shift is opened he should see new shift
        // receipts only."
        Sanctum::actingAs($this->hassan, ['staff']);
        $this->assertSame([], $this->numbers([]), 'no shift open: no receipts');

        $old = Shift::create(['user_id' => $this->hassan->id, 'device_id' => $this->front->id, 'opened_at' => now()->subDay(), 'closed_at' => now()->subDay()->addHours(8), 'opening_cash' => 100]);
        Order::where('order_number', 'H-PAID')->update(['shift_id' => $old->id]);
        Order::factory()->create(['order_number' => 'H-HELD', 'user_id' => $this->hassan->id, 'shift_id' => $old->id, 'status' => 'held', 'payment_status' => 'unpaid']);
        $shift = Shift::create(['user_id' => $this->hassan->id, 'device_id' => $this->front->id, 'opened_at' => now()->subHour(), 'opening_cash' => 100]);
        Order::where('order_number', 'H-LIVE')->update(['shift_id' => $shift->id]);
        Order::factory()->create(['order_number' => 'H-NEW', 'user_id' => $this->hassan->id, 'shift_id' => $shift->id, 'status' => 'completed', 'payment_status' => 'paid', 'paid_at' => now()]);

        $this->assertSame(['H-LIVE', 'H-NEW'], $this->numbers([]), 'the open shift only');
        $this->assertSame(['H-NEW'], $this->numbers(['paid_only' => 1]));
        $this->assertSame([], $this->numbers(['date' => now()->subDay()->toDateString()]), 'a date cannot reach past the open shift');
        $this->assertSame([], $this->numbers(['shift_id' => $old->id]), 'nor can naming the closed shift');
        $this->assertSame(['H-HELD'], $this->numbers(['held_only' => 1]), 'a parked ticket from an earlier shift is still theirs to resume');
        // Asking for another cashier is refused; asking for a till is ignored.
        $this->getJson('/api/orders?user_id=' . $this->aisha->id)->assertForbidden();
        $this->assertSame(['H-LIVE', 'H-NEW'], $this->numbers(['device_id' => $this->back->id]));

        $this->getJson('/api/orders/receipt-filters')->assertForbidden();
    }

    public function test_the_filters_endpoint_lists_active_staff_and_pos_tills(): void
    {
        $this->makeStaff('staff', ['name' => 'Gone', 'is_active' => false, 'phone' => '+9607770013']);
        Sanctum::actingAs($this->makeOwner(['name' => 'Ahmed', 'phone' => '+9607770014']), ['staff']);

        $res = $this->getJson('/api/orders/receipt-filters')->assertOk();
        $names = array_column($res->json('cashiers'), 'name');
        $this->assertContains('Hassan', $names);
        $this->assertContains('Aisha', $names);
        $this->assertContains('Ahmed', $names);
        $this->assertNotContains('Gone', $names);

        $tills = array_column($res->json('tills'), 'name');
        $this->assertSame(['Back till', 'Front till'], $tills, 'POS devices only, by name');
    }
}
