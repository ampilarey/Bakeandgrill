<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use App\Services\OrderStatusMachine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Wave F — Single transition path tests.
 *
 *  1.  Unit: machine allows all documented forward transitions
 *  2.  Unit: machine blocks all undocumented transitions
 *  3.  Unit: terminal statuses have no outgoing transitions
 *  4.  HTTP: KDS start on pending order succeeds
 *  5.  HTTP: KDS start on completed order returns 422
 *  6.  HTTP: KDS bump pending → ready → completed
 *  7.  HTTP: hold on pending succeeds
 *  8.  HTTP: hold on completed order returns 422
 *  9.  HTTP: resume from held succeeds
 * 10.  HTTP: resume from pending (not held) returns 422
 * 11.  HTTP: addPayments on cancelled order returns 422
 * 12.  HTTP: addPayments on already-paid order returns 422
 */
class OrderStatusMachineTest extends TestCase
{
    use RefreshDatabase;

    private const DEVICE_ID = 'STATUS-POS-001';

    private User $staffUser;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $cat = Category::create(['name' => 'Status Food', 'slug' => 'status-food', 'is_active' => true]);

        $this->item = Item::create([
            'category_id' => $cat->id,
            'name' => 'Status Item',
            'base_price' => 50.0,
            'sku' => 'STATUS-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $role = Role::create(['name' => 'Cashier', 'slug' => 'cashier', 'is_active' => true]);
        $this->staffUser = User::create([
            'name' => 'Cashier',
            'email' => 'cashier@status-test.com',
            'password' => Hash::make('pw'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        Device::create([
            'name' => 'Status POS',
            'identifier' => self::DEVICE_ID,
            'type' => 'pos',
            'is_active' => true,
        ]);
    }

    private function machine(): OrderStatusMachine
    {
        return app(OrderStatusMachine::class);
    }

    private function createOrderWithStatus(string $status): Order
    {
        Sanctum::actingAs($this->staffUser, ['staff']);
        $response = $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson('/api/orders', [
                'type' => 'dine_in',
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ]);

        $order = Order::findOrFail($response->json('order.id'));
        \Illuminate\Support\Facades\DB::table('orders')
            ->where('id', $order->id)
            ->update(['status' => $status]);
        $order->refresh();

        return $order;
    }

    // ------------------------------------------------------------------
    // Unit tests — machine logic
    // ------------------------------------------------------------------

    public function test_valid_forward_transitions_are_allowed(): void
    {
        $machine = $this->machine();

        $this->assertTrue($machine->isAllowed('pending', 'in_progress'));
        $this->assertTrue($machine->isAllowed('pending', 'ready'));    // KDS bump shortcut
        $this->assertTrue($machine->isAllowed('pending', 'paid'));
        $this->assertTrue($machine->isAllowed('pending', 'held'));
        $this->assertTrue($machine->isAllowed('pending', 'cancelled'));
        $this->assertTrue($machine->isAllowed('paid', 'in_progress'));
        $this->assertTrue($machine->isAllowed('paid', 'refunded'));
        $this->assertTrue($machine->isAllowed('in_progress', 'ready'));
        $this->assertTrue($machine->isAllowed('ready', 'completed'));
        $this->assertTrue($machine->isAllowed('held', 'pending'));
        $this->assertTrue($machine->isAllowed('payment_pending', 'paid'));
        $this->assertTrue($machine->isAllowed('payment_pending', 'cancelled'));
        $this->assertTrue($machine->isAllowed('completed', 'refunded'));
    }

    public function test_invalid_transitions_are_blocked(): void
    {
        $machine = $this->machine();

        // Cannot jump backwards
        $this->assertFalse($machine->isAllowed('completed', 'pending'));
        $this->assertFalse($machine->isAllowed('in_progress', 'pending'));
        $this->assertFalse($machine->isAllowed('refunded', 'paid'));

        // Cannot skip states arbitrarily
        $this->assertFalse($machine->isAllowed('pending', 'completed'));
        $this->assertFalse($machine->isAllowed('pending', 'refunded'));
    }

    /**
     * BE-201: `ready → in_progress` and `completed → in_progress`
     * ARE legal — they represent a KDS recall (cashier marked a
     * ticket done too early, kitchen pulls it back). Previously the
     * test list above asserted these were invalid; they are now
     * explicitly allowed via the state machine instead of forcing
     * controllers to mutate `status` directly.
     */
    public function test_kds_recall_transitions_are_allowed(): void
    {
        $machine = $this->machine();

        $this->assertTrue($machine->isAllowed('ready', 'in_progress'));
        $this->assertTrue($machine->isAllowed('completed', 'in_progress'));
    }

    public function test_terminal_statuses_have_no_outgoing_transitions(): void
    {
        $machine = $this->machine();

        $this->assertEmpty($machine->nextStates('cancelled'));
        $this->assertEmpty($machine->nextStates('refunded'));
    }

    // ------------------------------------------------------------------
    // HTTP integration tests
    // ------------------------------------------------------------------

    public function test_kds_start_on_pending_order_succeeds(): void
    {
        $order = $this->createOrderWithStatus('pending');
        Sanctum::actingAs($this->staffUser, ['staff']);

        $this->postJson("/api/kds/orders/{$order->id}/start")
            ->assertOk()
            ->assertJsonPath('order.status', 'in_progress');
    }

    public function test_kds_start_on_completed_order_recalls_to_in_progress(): void
    {
        // BE-201: starting a "completed" ticket from KDS is a recall —
        // the cashier hit done too early. The OrderStatusMachine now
        // allows this transition, so the endpoint must succeed and
        // flip the order back to in_progress instead of bouncing the
        // request with 422.
        $order = $this->createOrderWithStatus('completed');
        Sanctum::actingAs($this->staffUser, ['staff']);

        $this->postJson("/api/kds/orders/{$order->id}/start")
            ->assertOk()
            ->assertJsonPath('order.status', 'in_progress');
    }

    public function test_kds_bump_pending_to_ready_then_completed(): void
    {
        $order = $this->createOrderWithStatus('pending');
        Sanctum::actingAs($this->staffUser, ['staff']);

        // KDS bump from non-ready is intentionally blocked — the
        // cashier marks ready from POS now, and KDS only completes
        // already-ready tickets. This test predates that product
        // change; left in skipped state to preserve the original
        // assertion intent for archaeology.
        $this->markTestSkipped('KDS no longer supports pending→ready bump; cashier marks ready from POS.');
    }

    public function test_hold_on_pending_order_succeeds(): void
    {
        $order = $this->createOrderWithStatus('pending');
        Sanctum::actingAs($this->staffUser, ['staff']);

        $this->postJson("/api/orders/{$order->id}/hold")
            ->assertOk()
            ->assertJsonPath('order.status', 'held');
    }

    public function test_hold_on_completed_order_returns_422(): void
    {
        $order = $this->createOrderWithStatus('completed');
        Sanctum::actingAs($this->staffUser, ['staff']);

        $this->postJson("/api/orders/{$order->id}/hold")
            ->assertStatus(422);
    }

    public function test_resume_from_held_succeeds(): void
    {
        $order = $this->createOrderWithStatus('held');
        Sanctum::actingAs($this->staffUser, ['staff']);

        $this->postJson("/api/orders/{$order->id}/resume")
            ->assertOk()
            ->assertJsonPath('order.status', 'pending');
    }

    public function test_resume_from_pending_returns_422(): void
    {
        $order = $this->createOrderWithStatus('pending');
        Sanctum::actingAs($this->staffUser, ['staff']);

        // pending → pending is not an allowed transition (resume requires held)
        $this->postJson("/api/orders/{$order->id}/resume")
            ->assertStatus(422);
    }

    public function test_add_payments_to_cancelled_order_returns_422(): void
    {
        $order = $this->createOrderWithStatus('cancelled');
        Sanctum::actingAs($this->staffUser, ['staff']);

        $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson("/api/orders/{$order->id}/payments", [
                'payments' => [['method' => 'cash', 'amount' => 50.0]],
            ])
            ->assertStatus(422);
    }

    public function test_add_payments_to_already_paid_order_returns_422(): void
    {
        $order = $this->createOrderWithStatus('paid');
        Sanctum::actingAs($this->staffUser, ['staff']);

        $this->withHeader('X-Device-Identifier', self::DEVICE_ID)
            ->postJson("/api/orders/{$order->id}/payments", [
                'payments' => [['method' => 'cash', 'amount' => 50.0]],
            ])
            ->assertStatus(422);
    }
}
