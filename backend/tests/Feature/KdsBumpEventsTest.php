<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Orders\Events\OrderCompleted;
use App\Domains\Orders\Events\OrderPaid;
use App\Models\Category;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Regression: BE-002 + BE-003 — KDS bump events.
 *
 * Bug (pre-fix):
 *   KdsController::bump dispatched OrderPaid whenever an UNPAID order
 *   was bumped to completed. OrderPaid's listener chain included
 *   inventory deduction, loyalty hold consumption, referral recording,
 *   webhooks announcing "payment received", and a customer SMS thanking
 *   them for paying — all on a ticket that hadn't been settled. This
 *   was direct customer-trust and accounting damage.
 *
 * Fix:
 *   KDS bump dispatches OrderCompleted (which earns loyalty + fires the
 *   order.completed webhook). OrderPaid is reserved for actual payment
 *   collection via PaymentService::confirmPayment / OrderController::addPayments.
 */
class KdsBumpEventsTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;
    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'KDS Test', 'slug' => 'kds-bump', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'KDS Item',
            'base_price' => 30.0,
            'sku' => 'KDS-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $role = Role::create(['name' => 'Cashier', 'slug' => 'cashier', 'is_active' => true]);
        $this->staff = User::create([
            'name' => 'KDS Staff',
            'email' => 'kds@bump.test',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Device::create(['name' => 'KDS POS', 'identifier' => 'KDS-POS', 'type' => 'pos', 'is_active' => true]);
    }

    public function test_bumping_unpaid_order_to_completed_fires_OrderCompleted_not_OrderPaid(): void
    {
        Event::fake([OrderPaid::class, OrderCompleted::class]);
        Sanctum::actingAs($this->staff, ['staff']);

        // Create an unpaid in_progress order (cash-on-pickup style).
        $order = Order::create([
            'order_number' => 'KDS-001',
            'type' => 'takeaway',
            'status' => 'in_progress',
            'subtotal' => 30.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 30.0,
            'total_laar' => 3000,
        ]);

        // First bump: in_progress → ready
        $this->postJson("/api/kds/orders/{$order->id}/bump")->assertOk();
        // Second bump: ready → completed
        $this->postJson("/api/kds/orders/{$order->id}/bump")->assertOk();

        $fresh = Order::find($order->id);
        $this->assertSame('completed', $fresh->status);
        $this->assertNotNull($fresh->completed_at);

        // The whole point of the fix.
        // OrderPaid would have fired payment-confirmation SMS, loyalty
        // consumption, and webhooks falsely claiming the customer paid.
        Event::assertNotDispatched(OrderPaid::class);

        // Reaching completed status should fire OrderCompleted so loyalty
        // points are earned and the order.completed webhook fires.
        Event::assertDispatched(OrderCompleted::class);
    }

    public function test_bumping_already_paid_order_to_completed_still_fires_OrderCompleted(): void
    {
        Event::fake([OrderPaid::class, OrderCompleted::class]);
        Sanctum::actingAs($this->staff, ['staff']);

        // Already-paid order in 'ready' (e.g. online order that was paid online).
        $order = Order::create([
            'order_number' => 'KDS-002',
            'type' => 'takeaway',
            'status' => 'ready',
            'subtotal' => 30.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 30.0,
            'total_laar' => 3000,
            'paid_at' => now()->subMinutes(5),
        ]);

        // Bump ready → completed.
        $this->postJson("/api/kds/orders/{$order->id}/bump")->assertOk();

        $this->assertSame('completed', Order::find($order->id)->status);

        // OrderPaid was already fired earlier in the order's lifecycle; KDS
        // bump must not re-fire it.
        Event::assertNotDispatched(OrderPaid::class);

        // OrderCompleted fires so loyalty points accrue on completion
        // (kitchen-done, not payment-time).
        Event::assertDispatched(OrderCompleted::class);
    }
}
