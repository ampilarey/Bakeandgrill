<?php

declare(strict_types=1);

namespace Tests\Feature\Delivery;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\DeliveryDriver;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * 2026-08 audit #7 — driver assignment must require a delivery order, an
 * active driver, and a pre-dispatch state.
 */
class AssignDriverGuardTest extends TestCase
{
    use RefreshDatabase;

    private function actingManager(): void
    {
        PermissionCatalogSync::sync();
        $role = Role::firstOrCreate(
            ['slug' => 'manager'],
            ['name' => 'Manager', 'description' => 'Manager', 'is_active' => true],
        );
        $user = User::create([
            'name' => 'Dispatch Manager',
            'email' => 'dispatch@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'is_active' => true,
        ]);
        $user->grantPermission('orders.manage');
        Sanctum::actingAs($user, ['staff']);
    }

    protected function makeTypedOrder(string $type, string $status = "ready"): Order
    {
        return Order::create([
            'order_number' => strtoupper($type) . '-' . uniqid(),
            'type' => $type,
            'status' => $status,
            'subtotal' => 50,
            'total' => 50,
            'total_laar' => 5000,
        ]);
    }

    public function test_cannot_assign_driver_to_non_delivery_order(): void
    {
        $this->actingManager();
        $driver = DeliveryDriver::create(['name' => 'D', 'phone' => '+9607000001', 'is_active' => true]);
        $order = $this->makeTypedOrder('online_pickup');

        $this->postJson("/api/delivery/orders/{$order->id}/assign-driver", [
            'driver_id' => $driver->id,
        ])->assertStatus(422);

        $this->assertNull($order->fresh()->delivery_driver_id);
    }

    public function test_cannot_assign_inactive_driver(): void
    {
        $this->actingManager();
        $driver = DeliveryDriver::create(['name' => 'D', 'phone' => '+9607000002', 'is_active' => false]);
        $order = $this->makeTypedOrder('delivery');

        $this->postJson("/api/delivery/orders/{$order->id}/assign-driver", [
            'driver_id' => $driver->id,
        ])->assertStatus(422);

        $this->assertNull($order->fresh()->delivery_driver_id);
    }

    public function test_can_assign_active_driver_to_ready_delivery(): void
    {
        $this->actingManager();
        $driver = DeliveryDriver::create(['name' => 'D', 'phone' => '+9607000003', 'is_active' => true]);
        $order = $this->makeTypedOrder('delivery', 'ready');

        $this->postJson("/api/delivery/orders/{$order->id}/assign-driver", [
            'driver_id' => $driver->id,
        ])->assertOk();

        $this->assertSame($driver->id, $order->fresh()->delivery_driver_id);
        $this->assertSame('out_for_delivery', $order->fresh()->status);
    }
}
