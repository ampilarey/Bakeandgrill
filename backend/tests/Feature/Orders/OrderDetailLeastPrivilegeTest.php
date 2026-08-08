<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OrderDetailLeastPrivilegeTest extends TestCase
{
    use RefreshDatabase;

    private Order $order;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();

        $this->customer = Customer::create([
            'name' => 'Ali',
            'phone' => '+9607008899',
        ]);

        $this->order = Order::create([
            'order_number' => 'LP-001',
            'type' => 'dine_in',
            'status' => 'preparing',
            'payment_status' => 'unpaid',
            'customer_id' => $this->customer->id,
            'subtotal' => 80,
            'total' => 80,
            'total_laar' => 8000,
        ]);

        Payment::create([
            'order_id' => $this->order->id,
            'method' => 'cash',
            'amount' => 10,
            'amount_laar' => 1000,
            'status' => 'confirmed',
            'idempotency_key' => 'lp-pay-1',
        ]);
    }

    private function makeUserWithRole(string $email, string $roleSlug): User
    {
        $role = Role::firstOrCreate(
            ['slug' => $roleSlug],
            ['name' => $roleSlug, 'is_active' => true],
        );

        return User::create([
            'name' => 'Staff ' . $email,
            'email' => $email,
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    public function test_low_privilege_staff_cannot_retrieve_arbitrary_active_order_details(): void
    {
        // Role slug with no catalog defaults — no POS/KDS grants.
        $staff = $this->makeUserWithRole('lowpriv@test.com', 'limited_viewer');
        Sanctum::actingAs($staff, ['staff']);

        $this->getJson("/api/orders/{$this->order->id}")->assertForbidden();
    }

    public function test_pos_staff_can_view_full_order_details(): void
    {
        $staff = $this->makeUserWithRole('posfull@test.com', 'staff');
        Sanctum::actingAs($staff, ['staff']);

        $this->getJson("/api/orders/{$this->order->id}")
            ->assertOk()
            ->assertJsonPath('order.id', $this->order->id)
            ->assertJsonPath('order.customer.phone', '+9607008899')
            ->assertJsonStructure(['order' => ['payments']]);
    }

    public function test_kds_staff_receive_sanitized_kitchen_summary(): void
    {
        // kitchen_staff has kds.view but not pos.ring_sales / orders.manage.
        $staff = $this->makeUserWithRole('kds@test.com', 'kitchen_staff');
        Sanctum::actingAs($staff, ['staff']);

        $response = $this->getJson("/api/orders/{$this->order->id}")
            ->assertOk()
            ->assertJsonPath('view', 'kitchen_summary')
            ->assertJsonPath('order.id', $this->order->id)
            ->assertJsonMissingPath('order.customer')
            ->assertJsonMissingPath('order.payments');

        $this->assertArrayNotHasKey('customer', $response->json('order'));
        $this->assertArrayNotHasKey('payments', $response->json('order'));
    }

    public function test_customer_cannot_access_staff_order_detail(): void
    {
        Sanctum::actingAs($this->customer, ['customer']);
        $this->getJson("/api/orders/{$this->order->id}")->assertForbidden();
    }
}
