<?php

declare(strict_types=1);

namespace Tests\Feature\Kitchen;

use App\Domains\Orders\Services\OrderCreationService;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Item;
use App\Models\KitchenMenuState;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\Printer;
use App\Models\PrintJob;
use App\Models\SiteSetting;
use App\Models\User;
use App\Services\OrderStatusTransitionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Kitchen audit, 2026-09-26.
 *
 * A: the lane comes from the kitchen's own timestamps, so paying at the till
 * no longer sends a cooking ticket back to "New", and a ticket that was ready
 * and then paid leaves the board. Scheduled pickups wait for their lead time,
 * and the wall board shows what the kitchen screen shows.
 *
 * B: every kitchen print event prints; an add-on prints only the new lines,
 * an edit prints what to add and what to stop, a cancellation prints a slip.
 *
 * C: the sold-out button sets a state, and an add-on reopens a done ticket.
 */
class KitchenAuditFixesTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Item $burger;

    private Item $fries;

    private Printer $printer;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-09-26 12:00:00');
        PermissionCatalogSync::sync();
        $this->owner = $this->makeOwner();
        Sanctum::actingAs($this->owner, ['staff']);

        config(['services.print_proxy.key' => 'test-key', 'services.print_proxy.url' => 'http://proxy.test']);
        Http::fake(['proxy.test/*' => Http::response(['success' => true])]);
        $this->printer = Printer::create([
            'name' => 'Kitchen 1', 'type' => 'kitchen', 'ip_address' => '192.168.1.50', 'port' => 9100, 'is_active' => true,
        ]);

        $category = Category::create(['name' => 'Food', 'is_active' => true]);
        $grill = MenuGroup::create(['name' => 'Grill', 'slug' => 'grill', 'is_active' => true]);
        $this->burger = Item::create([
            'name' => 'Burger', 'category_id' => $category->id, 'menu_group_id' => $grill->id,
            'base_price' => 60, 'is_available' => true, 'is_active' => true,
        ]);
        $this->fries = Item::create([
            'name' => 'Fries', 'category_id' => $category->id, 'menu_group_id' => $grill->id,
            'base_price' => 20, 'is_available' => true, 'is_active' => true,
        ]);
        KitchenMenuState::current()->update(['active_menu_group_ids' => [$grill->id]]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** @return list<array<string, mixed>> */
    private function lines(Item ...$items): array
    {
        return array_map(fn (Item $item) => [
            'item_id' => $item->id, 'quantity' => 1, 'unit_price' => (float) $item->base_price,
        ], $items);
    }

    private function sell(Item ...$items): Order
    {
        $order = app(OrderCreationService::class)->createFromPayload(
            ['type' => 'pos', 'items' => $this->lines(...$items)],
            $this->owner,
        );
        // The first chit prints from OrderCreated after the response; here it
        // is called directly (idempotent, as the listener's call is).
        app(\App\Domains\Printing\Services\PrintJobService::class)->dispatchKitchen($order->fresh(['items.modifiers']));

        return $order->fresh();
    }

    private function to(Order $order, string $status): Order
    {
        return app(OrderStatusTransitionService::class)->transition($order->fresh(), $status);
    }

    /** @return array<int, array<string, mixed>> */
    private function board(): array
    {
        return collect($this->getJson('/api/kds/orders')->assertOk()->json('orders'))->keyBy('id')->all();
    }

    /** @return list<array<string, mixed>> */
    private function chits(Order $order): array
    {
        return PrintJob::where('order_id', $order->id)->orderBy('id')->get()->pluck('payload')->all();
    }

    // ── A. Lanes ───────────────────────────────────────────────────────────

    public function test_a_ticket_paid_while_cooking_stays_in_cooking(): void
    {
        $order = $this->sell($this->burger);
        $this->postJson("/api/kds/orders/{$order->id}/start")->assertOk();
        $this->to($order, 'paid');

        $row = $this->board()[$order->id];
        $this->assertSame('paid', $row['status']);
        $this->assertSame('cooking', $row['kitchen_lane']);

        // And the kitchen can still finish it.
        $this->postJson("/api/kds/orders/{$order->id}/kitchen-done")->assertOk();
    }

    public function test_a_ticket_ready_and_then_paid_leaves_the_board(): void
    {
        $order = $this->sell($this->burger);
        $this->to($order, 'in_progress');
        $this->to($order, 'ready');
        $this->assertSame('ready', $this->board()[$order->id]['kitchen_lane']);

        $this->to($order, 'paid');
        $this->assertArrayNotHasKey($order->id, $this->board());
    }

    public function test_a_ticket_paid_before_the_kitchen_starts_is_new(): void
    {
        $order = $this->sell($this->burger);
        $this->to($order, 'paid');

        $this->assertSame('new', $this->board()[$order->id]['kitchen_lane']);
    }

    public function test_a_pickup_for_later_waits_for_its_lead_time(): void
    {
        SiteSetting::set('kitchen_scheduled_pickup_lead_minutes', '30');
        SiteSetting::bust();
        $order = Order::factory()->create([
            'type' => 'online_pickup', 'status' => 'pending', 'user_id' => null,
            'paid_at' => now(), 'pickup_slot_at' => now()->addHours(4),
        ]);

        $res = $this->getJson('/api/kds/orders')->assertOk();
        $this->assertNotContains($order->id, collect($res->json('orders'))->pluck('id')->all());
        $this->assertSame(1, $res->json('later_today'));

        Carbon::setTestNow(now()->addHours(3)->addMinutes(35));
        $row = $this->board()[$order->id];
        $this->assertTrue(Carbon::parse($row['kitchen_clock_at'])->equalTo(Carbon::parse('2026-09-26 12:00:00')->addHours(4)->subMinutes(30)));
        $this->assertNotNull($row['pickup_slot_at']);
    }

    public function test_a_fired_order_is_timed_from_the_fire(): void
    {
        $order = Order::factory()->create([
            'type' => 'takeaway', 'status' => 'paid', 'fulfil_date' => today(),
            'created_at' => now()->subDay(), 'fired_at' => now()->subMinutes(5),
        ]);

        $row = $this->board()[$order->id];
        $this->assertTrue(Carbon::parse($row['kitchen_clock_at'])->equalTo(now()->subMinutes(5)));
    }

    public function test_the_wall_board_shows_cooking_and_paid_tickets_by_lane(): void
    {
        $cooking = $this->sell($this->burger);
        $this->to($cooking, 'in_progress');
        $paid = $this->sell($this->fries);
        $this->to($paid, 'paid');
        $catering = Order::factory()->create(['type' => 'catering', 'status' => 'pending', 'fired_at' => null]);

        $token = $this->owner->createToken('board-Kitchen', ['board'], now()->addYear())->plainTextToken;
        $this->app['auth']->forgetGuards();
        $orders = collect($this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/board/orders')->assertOk()->json('orders'))->keyBy('id');

        $this->assertSame('cooking', $orders[$cooking->id]['lane']);
        $this->assertSame('new', $orders[$paid->id]['lane']);
        $this->assertFalse($orders->has($catering->id));
    }

    // ── B. Printing ────────────────────────────────────────────────────────

    public function test_every_reprint_from_the_kitchen_screen_prints(): void
    {
        $order = $this->sell($this->burger);

        $this->postJson("/api/kds/orders/{$order->id}/print-ticket")->assertOk();
        Carbon::setTestNow(now()->addSeconds(5));
        $this->postJson("/api/kds/orders/{$order->id}/print-ticket")->assertOk();

        $this->assertCount(2, collect($this->chits($order))->where('order.heading', 'REPRINT'));
    }

    public function test_an_add_on_prints_only_the_new_lines_every_time(): void
    {
        $order = $this->sell($this->burger);
        $service = app(OrderCreationService::class);

        $service->addItemsToOrder($order->fresh(), $this->lines($this->fries));
        $service->addItemsToOrder($order->fresh(), $this->lines($this->fries));

        $added = collect($this->chits($order))->where('order.heading', 'ADDED')->values();
        $this->assertCount(2, $added);
        foreach ($added as $chit) {
            $this->assertSame(['Fries'], array_column($chit['order']['items'], 'item_name'));
        }
    }

    public function test_an_edit_prints_what_to_add_and_what_to_stop(): void
    {
        $order = $this->sell($this->burger);

        app(OrderCreationService::class)->replaceOrderItems($order->fresh(), $this->lines($this->fries));

        $changed = collect($this->chits($order))->firstWhere('order.heading', 'CHANGED');
        $this->assertNotNull($changed);
        $names = array_column($changed['order']['items'], 'item_name');
        $this->assertContains('Fries', $names);
        $this->assertContains('VOID: Burger', $names);
    }

    public function test_a_cancelled_order_prints_a_slip_and_shows_flagged(): void
    {
        $order = $this->sell($this->burger);
        $this->to($order, 'cancelled');

        $slip = collect($this->chits($order))->firstWhere('order.heading', 'CANCELLED - DO NOT MAKE');
        $this->assertNotNull($slip);
        $this->assertSame('CANCEL: Burger', $slip['order']['items'][0]['item_name']);

        $this->assertSame('cancelled', $this->board()[$order->id]['kitchen_lane']);
        Carbon::setTestNow(now()->addMinutes(5));
        $this->assertArrayNotHasKey($order->id, $this->board());
    }

    public function test_the_chit_carries_table_pickup_time_and_customer_note(): void
    {
        $order = Order::factory()->create([
            'type' => 'online_pickup', 'status' => 'pending', 'user_id' => null,
            'ticket_name' => 'Aisha', 'customer_notes' => 'Ring when ready',
            'pickup_slot_at' => Carbon::parse('2026-09-26 14:00:00', 'Indian/Maldives'),
        ]);
        \App\Models\OrderItem::create([
            'order_id' => $order->id, 'item_id' => $this->burger->id, 'item_name' => 'Burger',
            'quantity' => 1, 'unit_price' => 60, 'total_price' => 60, 'notes' => 'No onions',
        ]);

        app(\App\Domains\Printing\Services\PrintJobService::class)->dispatchKitchen($order->fresh());

        $chit = $this->chits($order)[0]['order'];
        $this->assertSame('Aisha', $chit['table']);
        $this->assertSame('14:00', $chit['pickup_at']);
        $this->assertSame('Ring when ready', $chit['customer_notes']);
        $this->assertSame('No onions', $chit['items'][0]['notes']);
    }

    // ── C. Small ───────────────────────────────────────────────────────────

    public function test_sold_out_sets_the_state_it_was_asked_for(): void
    {
        $this->postJson("/api/kds/items/{$this->burger->id}/86", ['available' => false])->assertOk();
        $this->postJson("/api/kds/items/{$this->burger->id}/86", ['available' => false])->assertOk();

        $this->assertFalse((bool) $this->burger->fresh()->is_available);
    }

    public function test_an_add_on_to_a_ready_ticket_puts_it_back_in_cooking(): void
    {
        $order = $this->sell($this->burger);
        $this->to($order, 'in_progress');
        $this->to($order, 'ready');

        app(OrderCreationService::class)->addItemsToOrder($order->fresh(), $this->lines($this->fries));

        $fresh = $order->fresh();
        $this->assertSame('in_progress', $fresh->status);
        $this->assertNull($fresh->ready_at);
        $this->assertSame('cooking', $this->board()[$order->id]['kitchen_lane']);
    }
}
