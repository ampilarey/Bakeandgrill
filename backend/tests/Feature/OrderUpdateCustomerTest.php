<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MenuGroup;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OrderUpdateCustomerTest extends TestCase
{
    use RefreshDatabase;

    public function test_staff_can_attach_customer_to_paid_pickup_order(): void
    {
        MenuGroup::firstOrCreate(['slug' => 'default'], ['name' => 'Default', 'is_active' => true]);
        $category = Category::create(['name' => 'Pickup', 'slug' => 'pickup-food', 'is_active' => true]);
        $item = Item::create([
            'category_id' => $category->id,
            'name' => 'Pickup Item',
            'base_price' => 30.0,
            'sku' => 'PU-1',
            'is_active' => true,
            'is_available' => true,
        ]);

        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $staff = User::create([
            'name' => 'Pickup Cashier',
            'email' => 'pickup@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);

        $customer = Customer::create([
            'phone' => '+9607123456',
            'name' => 'Ahmed',
            'loyalty_points' => 0,
            'tier' => 'bronze',
            'last_order_at' => null,
        ]);

        $order = Order::create([
            'order_number' => 'PU-1001',
            'type' => 'online_pickup',
            'status' => 'ready',
            'payment_status' => 'paid',
            'subtotal' => 30,
            'total' => 30,
            'user_id' => $staff->id,
        ]);
        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'unit_price' => 30,
            'quantity' => 1,
            'total_price' => 30,
        ]);

        Sanctum::actingAs($staff, ['staff']);

        $this->patchJson("/api/orders/{$order->id}/customer", [
            'customer_id' => $customer->id,
        ])
            ->assertOk()
            ->assertJsonPath('order.customer.phone', '+9607123456');

        $this->assertSame($customer->id, $order->fresh()->customer_id);
        $this->assertNotNull($customer->fresh()->last_order_at);
    }

    public function test_cannot_change_customer_on_completed_order(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'staff'],
            ['name' => 'Staff', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $staff = User::create([
            'name' => 'Staff',
            'email' => 'staff-closed@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        $customer = Customer::create([
            'phone' => '+9607999999',
            'loyalty_points' => 0,
            'tier' => 'bronze',
        ]);
        $order = Order::create([
            'order_number' => 'PU-DONE',
            'type' => 'online_pickup',
            'status' => 'completed',
            'payment_status' => 'paid',
            'subtotal' => 10,
            'total' => 10,
            'user_id' => $staff->id,
        ]);

        Sanctum::actingAs($staff, ['staff']);

        $this->patchJson("/api/orders/{$order->id}/customer", [
            'customer_id' => $customer->id,
        ])->assertStatus(422);
    }
}
