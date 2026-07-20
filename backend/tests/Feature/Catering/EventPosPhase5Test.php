<?php

declare(strict_types=1);

namespace Tests\Feature\Catering;

use App\Models\CateringRequest;
use App\Models\CateringRequestLine;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Permission;
use App\Models\Printer;
use App\Models\PrintJob;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EventPosPhase5Test extends TestCase
{
    use RefreshDatabase;

    private User $eventsStaff;

    private User $cashier;

    private Device $device;

    private Item $stockItem;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        Permission::query()->firstOrCreate(
            ['slug' => 'events.manage'],
            ['name' => 'Manage events', 'group' => 'Events'],
        );
        Permission::query()->firstOrCreate(
            ['slug' => 'pos.ring_sales'],
            ['name' => 'Ring sales', 'group' => 'POS'],
        );
        Permission::query()->firstOrCreate(
            ['slug' => 'pos.open_shift'],
            ['name' => 'Open shift', 'group' => 'POS'],
        );
        Permission::query()->firstOrCreate(
            ['slug' => 'pos.close_shift'],
            ['name' => 'Close shift', 'group' => 'POS'],
        );
        Permission::query()->firstOrCreate(
            ['slug' => 'pos.active_orders'],
            ['name' => 'Active orders', 'group' => 'POS'],
        );
        Permission::query()->firstOrCreate(
            ['slug' => 'orders.view'],
            ['name' => 'View orders', 'group' => 'Orders'],
        );
        Permission::query()->firstOrCreate(
            ['slug' => 'payments.cash'],
            ['name' => 'Cash payments', 'group' => 'Payments'],
        );
        Permission::query()->firstOrCreate(
            ['slug' => 'kds.view'],
            ['name' => 'View KDS', 'group' => 'Kitchen'],
        );

        $this->eventsStaff = $this->makeStaff('staff', [
            'name' => 'Event Lead',
            'phone' => '7777101',
            'email' => 'lead@bakeandgrill.test',
        ]);
        $this->eventsStaff->grantPermission('events.manage');
        $this->eventsStaff->grantPermission('pos.ring_sales');
        $this->eventsStaff->grantPermission('pos.open_shift');
        $this->eventsStaff->grantPermission('pos.close_shift');
        $this->eventsStaff->grantPermission('pos.active_orders');
        $this->eventsStaff->grantPermission('orders.view');
        $this->eventsStaff->grantPermission('payments.cash');
        $this->eventsStaff->grantPermission('kds.view');

        $this->cashier = $this->makeStaff('staff', [
            'name' => 'Counter Cashier',
            'email' => 'cashier@bakeandgrill.test',
        ]);
        $this->cashier->grantPermission('pos.ring_sales');
        $this->cashier->grantPermission('pos.open_shift');
        $this->cashier->grantPermission('pos.close_shift');
        $this->cashier->grantPermission('pos.active_orders');
        $this->cashier->grantPermission('orders.view');
        $this->cashier->grantPermission('payments.cash');

        $this->device = Device::query()->create([
            'name' => 'POS-1',
            'identifier' => 'POS-EVENT-1',
            'type' => 'pos',
            'status' => 'approved',
            'is_active' => true,
        ]);

        $this->customer = $this->makeCustomer([
            'phone' => '+9607777001',
            'name' => 'Aisha',
        ]);

        $this->stockItem = Item::factory()->create([
            'name' => 'Fried Rice Tray',
            'base_price' => 450.00,
            'is_active' => true,
            'is_available' => true,
            'track_stock' => true,
            'availability_type' => 'stock_based',
            'stock_quantity' => 10,
            'has_variants' => false,
        ]);

        Printer::query()->create([
            'name' => 'Kitchen',
            'type' => 'kitchen',
            'ip_address' => '127.0.0.1',
            'port' => 9100,
            'is_active' => true,
            'station' => 'hot',
        ]);
    }

    private function deviceHeaders(): array
    {
        return ['X-Device-Identifier' => $this->device->identifier];
    }

    private function makeConfirmedEvent(array $orderOverrides = [], ?int $stockQty = 10): array
    {
        if ($stockQty !== null) {
            $this->stockItem->update(['stock_quantity' => $stockQty]);
        }

        $event = CateringRequest::create([
            'customer_id' => $this->customer->id,
            'reference' => CateringRequest::generateReference(),
            'contact_name' => 'Aisha',
            'phone' => '7777001',
            'email' => 'aisha@example.com',
            'event_date' => now()->toDateString(),
            'fulfillment_method' => 'pickup',
            'fulfillment_time' => '12:00:00',
            'setup_time' => '11:30:00',
            'venue_name' => 'Office Hall',
            'dietary_notes' => 'No nuts',
            'headcount' => 40,
            'status' => 'confirmed',
            'confirmed_at' => now(),
            'handled_by' => $this->eventsStaff->id,
            'quote_is_deposit' => true,
            'quote_payment_laar' => 22500,
            'quote_version' => 1,
        ]);

        CateringRequestLine::create([
            'catering_request_id' => $event->id,
            'item_id' => $this->stockItem->id,
            'name' => 'Fried Rice Tray',
            'quantity' => 2,
            'unit_price' => 450,
            'is_custom' => false,
            'sort_order' => 0,
        ]);

        $order = Order::create(array_merge([
            'order_number' => 'BG-CAT-'.uniqid(),
            'type' => 'catering',
            'status' => 'payment_pending',
            'payment_status' => 'partial',
            'customer_id' => $this->customer->id,
            'subtotal' => 900,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 900,
            'total_laar' => 90000,
            'notes' => 'Event '.$event->reference,
            'customer_notes' => 'No nuts',
            'fired_at' => null,
            'shift_id' => null,
            'user_id' => null,
        ], $orderOverrides));

        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $this->stockItem->id,
            'item_name' => 'Fried Rice Tray',
            'quantity' => 2,
            'unit_price' => 450,
            'total_price' => 900,
            'tax_rate' => 0,
            'tax_code' => 'standard_8',
            'packaging_fee' => 0,
            'packaging_fee_mode' => 'per_unit',
            'status' => 'pending',
        ]);

        Payment::create([
            'order_id' => $order->id,
            'method' => 'bml',
            'amount' => 225.00,
            'amount_laar' => 22500,
            'status' => 'confirmed',
            'shift_id' => null,
        ]);

        $event->update(['pos_order_id' => $order->id]);

        return [$event->fresh(['lines', 'handler', 'posOrder']), $order->fresh('items')];
    }

    public function test_pos_events_list_visible_without_events_manage(): void
    {
        [$event] = $this->makeConfirmedEvent();

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->withHeaders($this->deviceHeaders())
            ->getJson('/api/pos/events')
            ->assertOk()
            ->assertJsonPath('events.0.id', $event->id)
            ->assertJsonPath('events.0.display_status', 'confirmed')
            ->assertJsonPath('events.0.setup_time', '11:30')
            ->assertJsonPath('events.0.dietary_notes', 'No nuts')
            ->assertJsonPath('events.0.handled_by.name', 'Event Lead')
            ->assertJsonPath('events.0.order.payment_state', 'partial')
            ->assertJsonPath('events.0.order.balance_laar', 67500);
    }

    public function test_fire_gated_and_idempotent_with_stock_warn(): void
    {
        [$event, $order] = $this->makeConfirmedEvent([], 1);

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->withHeaders($this->deviceHeaders())
            ->postJson('/api/pos/events/'.$event->id.'/fire')
            ->assertForbidden();

        Sanctum::actingAs($this->eventsStaff, ['staff']);
        $this->withHeaders($this->deviceHeaders())
            ->postJson('/api/pos/events/'.$event->id.'/fire')
            ->assertStatus(409)
            ->assertJsonPath('requires_confirmation', true);

        $this->assertNull($order->fresh()->fired_at);
        $this->assertSame(1, (int) $this->stockItem->fresh()->stock_quantity);

        $this->withHeaders($this->deviceHeaders())
            ->postJson('/api/pos/events/'.$event->id.'/fire', ['confirm_shortages' => true])
            ->assertOk()
            ->assertJsonPath('order.status', 'pending');

        $order = $order->fresh();
        $this->assertNotNull($order->fired_at);
        $this->assertSame('pending', $order->status);
        // Deducted available 1 of 2 requested.
        $this->assertSame(0, (int) $this->stockItem->fresh()->stock_quantity);

        $jobsBefore = PrintJob::query()->where('order_id', $order->id)->count();
        $this->assertGreaterThanOrEqual(1, $jobsBefore);

        // Re-fire is idempotent — no double stock movement, same print key.
        $this->withHeaders($this->deviceHeaders())
            ->postJson('/api/pos/events/'.$event->id.'/fire', ['confirm_shortages' => true])
            ->assertOk()
            ->assertJsonPath('already_fired', true);

        $this->assertSame(0, (int) $this->stockItem->fresh()->stock_quantity);
        $this->assertSame($jobsBefore, PrintJob::query()->where('order_id', $order->id)->count());

        // Kitchen payload includes setup + dietary.
        $job = PrintJob::query()->where('order_id', $order->id)->first();
        $payload = $job->payload;
        $this->assertStringContainsString('SETUP BY 11:30', (string) ($payload['order']['notes'] ?? ''));
        $this->assertStringContainsString('DIETARY', (string) ($payload['order']['notes'] ?? ''));
        $this->assertSame('11:30', $payload['order']['setup_time'] ?? null);
    }

    public function test_balance_settle_attaches_collector_shift_and_marks_paid(): void
    {
        [, $order] = $this->makeConfirmedEvent();

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->withHeaders($this->deviceHeaders())
            ->postJson('/api/shifts/open', ['opening_cash' => 100])
            ->assertCreated();
        $shift = Shift::query()->where('user_id', $this->cashier->id)->whereNull('closed_at')->firstOrFail();

        $this->withHeaders($this->deviceHeaders())
            ->postJson('/api/orders/'.$order->id.'/payments', [
                'payments' => [
                    ['method' => 'cash', 'amount' => 675.00],
                ],
            ])
            ->assertOk();

        $cash = Payment::query()
            ->where('order_id', $order->id)
            ->where('method', 'cash')
            ->latest('id')
            ->firstOrFail();
        $this->assertSame($shift->id, (int) $cash->shift_id);
        $this->assertSame('paid', $order->fresh()->payment_status);
    }

    public function test_shift_close_unaffected_by_confirmed_events(): void
    {
        $this->makeConfirmedEvent();

        Sanctum::actingAs($this->cashier, ['staff']);
        $this->withHeaders($this->deviceHeaders())
            ->postJson('/api/shifts/open', ['opening_cash' => 100])
            ->assertCreated();
        $shift = Shift::query()->where('user_id', $this->cashier->id)->whereNull('closed_at')->firstOrFail();

        $close = $this->withHeaders($this->deviceHeaders())
            ->postJson('/api/shifts/'.$shift->id.'/close', ['closing_cash' => 100])
            ->assertOk();
        $this->assertArrayNotHasKey('open_unpaid_orders', $close->json());

        $this->assertNotNull($shift->fresh()->closed_at);
    }

    public function test_events_absent_from_active_orders_and_kds_until_fired(): void
    {
        [$event, $order] = $this->makeConfirmedEvent([], 20);

        Sanctum::actingAs($this->eventsStaff, ['staff']);

        $active = $this->withHeaders($this->deviceHeaders())
            ->getJson('/api/orders?active_only=1')
            ->assertOk();
        $ids = collect($active->json('data') ?? $active->json('orders') ?? [])
            ->pluck('id')
            ->all();
        $this->assertNotContains($order->id, $ids);

        $kds = $this->getJson('/api/kds/orders')->assertOk();
        $kdsIds = collect($kds->json('orders'))->pluck('id')->all();
        $this->assertNotContains($order->id, $kdsIds);

        $this->withHeaders($this->deviceHeaders())
            ->postJson('/api/pos/events/'.$event->id.'/fire')
            ->assertOk();

        // Still never in Active Orders (catering excluded by type).
        $active2 = $this->withHeaders($this->deviceHeaders())
            ->getJson('/api/orders?active_only=1')
            ->assertOk();
        $ids2 = collect($active2->json('data') ?? $active2->json('orders') ?? [])
            ->pluck('id')
            ->all();
        $this->assertNotContains($order->id, $ids2);

        // Appears on KDS after fire.
        $kds2 = $this->getJson('/api/kds/orders')->assertOk();
        $kdsIds2 = collect($kds2->json('orders'))->pluck('id')->all();
        $this->assertContains($order->id, $kdsIds2);
    }

    public function test_cancel_event_from_pos(): void
    {
        [$event] = $this->makeConfirmedEvent();

        Sanctum::actingAs($this->eventsStaff, ['staff']);
        $this->withHeaders($this->deviceHeaders())
            ->postJson('/api/pos/events/'.$event->id.'/cancel')
            ->assertOk()
            ->assertJsonPath('event.status', 'cancelled');

        $this->assertSame('cancelled', $event->fresh()->status);
    }
}
