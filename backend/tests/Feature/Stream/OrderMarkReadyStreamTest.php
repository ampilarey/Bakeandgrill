<?php

declare(strict_types=1);

namespace Tests\Feature\Stream;

use App\Domains\Orders\Events\OrderStatusChanged;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Verifies mark-ready propagates status changes for customer SSE consumers.
 */
class OrderMarkReadyStreamTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'is_active' => true, 'description' => ''],
        );

        $this->staff = User::create([
            'name' => 'Ready Cashier',
            'email' => 'ready-cashier@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    public function test_mark_ready_dispatches_order_status_changed_for_sse_pipeline(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $order = Order::create([
            'order_number' => 'READY-SSE-001',
            'type' => 'takeaway',
            'status' => 'in_progress',
            'payment_status' => 'paid',
            'subtotal' => 50,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 50,
        ]);

        Event::fake([OrderStatusChanged::class]);

        $this->postJson("/api/orders/{$order->id}/mark-ready")
            ->assertOk()
            ->assertJsonPath('order.status', 'ready');

        Event::assertDispatched(
            OrderStatusChanged::class,
            fn (OrderStatusChanged $event) => $event->data->orderId === $order->id
                && $event->data->status === 'ready',
        );
    }

    public function test_mark_ready_is_idempotent_when_already_ready(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $order = Order::create([
            'order_number' => 'READY-SSE-002',
            'type' => 'takeaway',
            'status' => 'ready',
            'payment_status' => 'paid',
            'subtotal' => 50,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 50,
        ]);

        $this->postJson("/api/orders/{$order->id}/mark-ready")
            ->assertOk()
            ->assertJsonPath('unchanged', true);
    }
}
