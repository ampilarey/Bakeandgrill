<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Orders\Events\OrderCompleted;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Permissions\PermissionCatalogSync;
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

        PermissionCatalogSync::sync();

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

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => 'Staff role', 'is_active' => true],
        );
        $this->staff = User::create([
            'name' => 'KDS Staff',
            'email' => 'kds@bump.test',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $this->staff->grantPermission('kds.bump_order');
        $this->staff->unsetRelation('permissions');
        Device::create(['name' => 'KDS POS', 'identifier' => 'KDS-POS', 'type' => 'pos', 'is_active' => true]);
        // KDS mutation routes (start/bump/recall) now require the
        // X-Device-Identifier header via the device.active middleware
        // — set it globally for every postJson in this suite so
        // individual tests don't need to repeat themselves.
        $this->withHeader('X-Device-Identifier', 'KDS-POS');
    }

    public function test_bumping_unpaid_order_to_completed_fires_order_completed_not_order_paid(): void
    {
        // KDS bump no longer transitions in_progress→ready — the
        // cashier marks ready from POS, KDS only does ready→completed.
        // Rewritten to start from ready so the assertion intent
        // (OrderCompleted fires, OrderPaid does NOT re-fire on KDS bump)
        // is still exercised.
        Event::fake([OrderPaid::class, OrderCompleted::class]);
        Sanctum::actingAs($this->staff, ['staff']);

        // Create an unpaid READY takeaway order (cash-on-pickup style)
        // — cashier already marked ready, KDS just confirms pickup.
        $order = Order::create([
            'order_number' => 'KDS-001',
            'type' => 'takeaway',
            'status' => 'ready',
            'subtotal' => 30.0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 30.0,
            'total_laar' => 3000,
        ]);

        // Bump ready → completed (the only KDS transition).
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

    public function test_bumping_already_paid_order_to_completed_still_fires_order_completed(): void
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
