<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Orders\Events\OrderCompleted;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * Owner, 2026-09-09: the kitchen display was carrying 77 tickets from four
 * days earlier, every one of them paid at the counter and served. A ticket
 * only leaves the board when a cashier marks it ready and someone bumps it,
 * so they sat there — and until an order reaches `completed` it is invisible
 * to every sales, GST and forecasting report.
 *
 * The command closes what is provably safe to close: money in, food out.
 * It must never close a ticket whose money is not confirmed.
 */
class CloseOutPaidOrdersTest extends TestCase
{
    use RefreshDatabase;

    private const NOW = '2026-09-09 11:00:00';

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse(self::NOW, config('app.timezone')));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function ticket(array $over = []): Order
    {
        $at = Carbon::parse($over['created_at'] ?? '2026-09-01 19:00:00', config('app.timezone'));

        return Order::factory()->create(array_merge([
            'type' => 'dine_in',
            'status' => 'paid',
            'payment_status' => 'paid',
            'customer_id' => null,
            'total' => 30,
            'created_at' => $at,
            'updated_at' => $at,
            'completed_at' => null,
        ], $over, ['created_at' => $at]));
    }

    public function test_it_completes_a_paid_ticket_left_on_the_board(): void
    {
        Event::fake([OrderCompleted::class]);
        $order = $this->ticket();

        $this->artisan('orders:close-out')
            ->expectsOutputToContain('1 paid ticket(s)')
            ->assertSuccessful();

        $order->refresh();
        $this->assertSame('completed', $order->status);
        $this->assertNotNull($order->completed_at);
        Event::assertDispatched(OrderCompleted::class);
    }

    public function test_the_sale_keeps_the_day_it_was_rung_up(): void
    {
        $order = $this->ticket(['created_at' => '2026-09-01 19:00:00']);

        $this->artisan('orders:close-out')->assertSuccessful();

        // Every report dates orders by created_at, so the money must stay on
        // the first, not move to the day somebody tidied the board.
        $this->assertSame('2026-09-01', $order->refresh()->created_at->toDateString());
    }

    public function test_it_writes_an_audit_entry_naming_the_command(): void
    {
        $order = $this->ticket();

        $this->artisan('orders:close-out')->assertSuccessful();

        $log = AuditLog::where('action', 'order.closed_out')->where('model_id', $order->id)->firstOrFail();
        $this->assertSame('paid', $log->old_values['status']);
        $this->assertSame('completed', $log->new_values['status']);
        $this->assertSame('orders:close-out', $log->meta['source']);
        $this->assertSame($order->order_number, $log->meta['order_number']);
    }

    public function test_a_dry_run_changes_nothing(): void
    {
        Event::fake([OrderCompleted::class]);
        $order = $this->ticket();

        $this->artisan('orders:close-out --dry-run')
            ->expectsOutputToContain('Dry run')
            ->assertSuccessful();

        $this->assertSame('paid', $order->refresh()->status);
        Event::assertNotDispatched(OrderCompleted::class);
    }

    public function test_it_never_closes_a_ticket_whose_money_is_not_in(): void
    {
        $unpaid = $this->ticket(['status' => 'pending', 'payment_status' => 'unpaid']);
        $part = $this->ticket(['status' => 'partial', 'payment_status' => 'partial']);
        $cooking = $this->ticket(['status' => 'in_progress', 'payment_status' => 'unpaid']);
        // Says paid on the ticket, but the money never landed.
        $mismatch = $this->ticket(['status' => 'paid', 'payment_status' => 'unpaid']);

        $this->artisan('orders:close-out')
            ->expectsOutputToContain('No paid ticket(s)')
            ->expectsOutputToContain('need a person')
            ->assertSuccessful();

        foreach ([$unpaid, $part, $cooking, $mismatch] as $order) {
            $this->assertNotSame('completed', $order->refresh()->status);
        }
    }

    public function test_a_ticket_marked_ready_but_never_bumped_is_closed(): void
    {
        $order = $this->ticket(['status' => 'ready']);

        $this->artisan('orders:close-out')->assertSuccessful();

        $this->assertSame('completed', $order->refresh()->status);
    }

    public function test_it_leaves_today_alone(): void
    {
        $today = $this->ticket(['created_at' => self::NOW]);

        $this->artisan('orders:close-out')->assertSuccessful();

        $this->assertSame('paid', $today->refresh()->status);
    }

    public function test_before_takes_a_date_and_beats_days(): void
    {
        $first = $this->ticket(['created_at' => '2026-09-01 19:00:00']);
        $fifth = $this->ticket(['created_at' => '2026-09-05 19:00:00']);

        $this->artisan('orders:close-out --before=2026-09-03')->assertSuccessful();

        $this->assertSame('completed', $first->refresh()->status);
        $this->assertSame('paid', $fifth->refresh()->status);
    }

    public function test_a_bad_date_stops_rather_than_guessing(): void
    {
        $order = $this->ticket();

        $this->artisan('orders:close-out --before=last-tuesday')->assertFailed();

        $this->assertSame('paid', $order->refresh()->status);
    }

    public function test_running_it_twice_closes_nothing_the_second_time(): void
    {
        Event::fake([OrderCompleted::class]);
        $this->ticket();

        $this->artisan('orders:close-out')->assertSuccessful();
        Event::assertDispatchedTimes(OrderCompleted::class, 1);

        $this->artisan('orders:close-out')->assertSuccessful();
        Event::assertDispatchedTimes(OrderCompleted::class, 1);
    }

    public function test_the_closed_day_reaches_the_sales_reports(): void
    {
        $item = Item::factory()->create(['name' => 'Nescafe']);
        $order = $this->ticket(['total' => 30]);
        OrderItem::create([
            'order_id' => $order->id, 'item_id' => $item->id, 'item_name' => $item->name,
            'quantity' => 2, 'unit_price' => 15, 'total_price' => 30,
        ]);

        $completedOn = fn () => Order::where('status', 'completed')
            ->whereBetween('created_at', ['2026-09-01 00:00:00', '2026-09-01 23:59:59'])
            ->sum('total');

        // The money is nowhere while the ticket sits open.
        $this->assertEqualsWithDelta(0, (float) $completedOn(), 0.01);

        $this->artisan('orders:close-out')->assertSuccessful();

        $this->assertEqualsWithDelta(30, (float) $completedOn(), 0.01);
    }

    public function test_loyalty_is_awarded_only_where_a_customer_is_attached(): void
    {
        Event::fake([OrderCompleted::class]);
        $walkIn = $this->ticket();
        $customer = Customer::factory()->create();
        $known = $this->ticket(['customer_id' => $customer->id]);

        $this->artisan('orders:close-out')->assertSuccessful();

        // Both complete; the listener itself decides who earns, and it skips
        // an order with no customer — which is every walk-in dine-in ticket.
        $this->assertSame('completed', $walkIn->refresh()->status);
        $this->assertSame('completed', $known->refresh()->status);
        Event::assertDispatchedTimes(OrderCompleted::class, 2);
    }

    public function test_limit_caps_one_run(): void
    {
        $this->ticket();
        $this->ticket();
        $this->ticket();

        $this->artisan('orders:close-out --limit=2')->assertSuccessful();

        $this->assertSame(2, Order::where('status', 'completed')->count());
        $this->assertSame(1, Order::where('status', 'paid')->count());
    }
}
