<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\Role;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Resume → Charge regression.
 *
 * The POS used to call createOrder() again after resuming a held
 * ticket, silently creating a duplicate order. The fix routes
 * `handleCharge` into `createOrderPayments(resumedOrderId, ...)` when
 * a resumed order is in flight.
 *
 * This test verifies the backend contract that supports the fix:
 *   1. Hold → Resume → addPayments on the SAME order id transitions
 *      that order to paid.
 *   2. Only ONE order exists for the cart afterwards (no duplicate).
 */
class PosResumeAndChargeTest extends TestCase
{
    use RefreshDatabase;

    private User $staffUser;
    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Food', 'slug' => 'resume-food', 'is_active' => true]);
        $this->item = Item::create([
            'category_id' => $category->id,
            'name' => 'Resume Test Item',
            'base_price' => 25.0,
            'sku' => 'RES-001',
            'is_active' => true,
            'is_available' => true,
        ]);

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $this->staffUser = User::create([
            'name' => 'Cashier',
            'email' => 'cashier@resume.test',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Device::create(['name' => 'Resume POS', 'identifier' => 'RES-POS', 'type' => 'pos', 'is_active' => true]);
    }

    public function test_hold_resume_then_charge_settles_same_order_without_duplicate(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        // 1. Create + hold one order
        $createRes = $this->withHeader('X-Device-Identifier', 'RES-POS')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'print' => false,
                'items' => [['item_id' => $this->item->id, 'quantity' => 2]],
            ])
            ->assertCreated();
        $orderId = $createRes->json('order.id');
        $orderTotal = (float) $createRes->json('order.total');
        $this->assertNotNull($orderId);

        $this->postJson("/api/orders/{$orderId}/hold", ['ticket_name' => 'Aisha'])
            ->assertOk();
        $this->assertSame('held', Order::find($orderId)->status);

        // 2. Resume
        $this->postJson("/api/orders/{$orderId}/resume")->assertOk();
        $this->assertSame('pending', Order::find($orderId)->status);

        // 3. Charge the SAME order id (this is exactly what the new
        //    resumed-order branch in handleCharge does)
        $this->postJson("/api/orders/{$orderId}/payments", [
            'payments' => [['method' => 'cash', 'amount' => $orderTotal]],
            'print_receipt' => false,
        ])->assertOk();

        // Order should be paid.
        $fresh = Order::find($orderId);
        $this->assertSame('paid', $fresh->status, 'resumed order must end up paid');
        $this->assertNotNull($fresh->paid_at);

        // Critical: only ONE order in the database for our test item.
        $this->assertSame(
            1,
            Order::count(),
            'resume → charge must NOT create a second order (duplicate-order bug)',
        );
    }

    public function test_cancel_resume_returns_order_to_held_status(): void
    {
        // Simulates handleCancelResume: cashier resumed by mistake,
        // taps "Cancel resume" — the POS calls POST /orders/{id}/hold
        // to put it back into Open Tickets.
        Sanctum::actingAs($this->staffUser, ['staff']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $orderId = $this->withHeader('X-Device-Identifier', 'RES-POS')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'print' => false,
                'items' => [['item_id' => $this->item->id, 'quantity' => 1]],
            ])
            ->assertCreated()
            ->json('order.id');

        $this->postJson("/api/orders/{$orderId}/hold", ['ticket_name' => 'A'])->assertOk();
        $this->postJson("/api/orders/{$orderId}/resume")->assertOk();
        $this->assertSame('pending', Order::find($orderId)->status);

        // POS calls hold again on cancel-resume.
        $this->postJson("/api/orders/{$orderId}/hold")->assertOk();
        $this->assertSame('held', Order::find($orderId)->status);
        $this->assertSame(1, Order::count(), 'cancel-resume must not duplicate the order');
    }

    /**
     * Regression: switching QUEUE_CONNECTION to redis must not turn a
     * successful payment into a 500 when Redis is slow or unreachable.
     * OrderStatusChanged (status → paid) used to dispatch synchronously
     * from OrderObserver and block on queue pushes before the JSON
     * response was sent.
     */
    public function test_add_payments_succeeds_when_redis_queue_is_unreachable(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);
        config(['queue.default' => 'sync']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $createRes = $this->withHeader('X-Device-Identifier', 'RES-POS')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'print' => false,
                'items' => [['item_id' => $this->item->id, 'quantity' => 2]],
            ])
            ->assertCreated();
        $orderId = $createRes->json('order.id');
        $orderTotal = (float) $createRes->json('order.total');

        config([
            'queue.default' => 'redis',
            'database.redis.default.host' => '127.0.0.1',
            'database.redis.default.port' => 6399,
        ]);
        $this->app->forgetInstance('redis');
        $this->app->forgetInstance(\Illuminate\Redis\RedisManager::class);

        $this->postJson("/api/orders/{$orderId}/payments", [
            'payments' => [['method' => 'cash', 'amount' => $orderTotal]],
            'print_receipt' => false,
        ])->assertOk();

        $this->assertSame('paid', Order::find($orderId)->status);
    }

    /**
     * Payment confirmation SMS must not depend on a queue worker.
     * OrderPaid fires inside DeferAfterResponse; the SMS listener runs
     * synchronously there so database/redis queue downtime cannot drop it.
     */
    public function test_add_payments_sends_payment_confirmation_sms_without_queue_worker(): void
    {
        Sanctum::actingAs($this->staffUser, ['staff']);
        config(['queue.default' => 'database']);
        $this->postJson('/api/shifts/open', ['opening_cash' => 100])->assertCreated();

        $customer = Customer::create([
            'name' => 'SMS Customer',
            'phone' => '+9607890123',
        ]);

        $createRes = $this->withHeader('X-Device-Identifier', 'RES-POS')
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'print' => false,
                'customer_id' => $customer->id,
                'items' => [['item_id' => $this->item->id, 'quantity' => 2]],
            ])
            ->assertCreated();
        $orderId = $createRes->json('order.id');
        $orderTotal = (float) $createRes->json('order.total');

        $this->postJson("/api/orders/{$orderId}/payments", [
            'payments' => [['method' => 'cash', 'amount' => $orderTotal]],
            'print_receipt' => false,
        ])->assertOk();

        $order = Order::findOrFail($orderId);
        $this->assertSame('paid', $order->status);

        $sms = SmsLog::query()
            ->where('idempotency_key', 'order:paid:confirm:' . $order->order_number)
            ->first();

        $this->assertNotNull($sms, 'payment confirmation SMS log must exist without a queue worker');
        $this->assertSame('+9607890123', $sms->to);
    }
}
