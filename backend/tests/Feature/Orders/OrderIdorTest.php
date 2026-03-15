<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Tests that order endpoints enforce ownership so customers cannot view other customers' orders.
 * Covers Security Audit Finding L — IDOR on staff order endpoint.
 * Also covers Finding A step 3 — IDOR on GET /api/orders/{id}.
 */
class OrderIdorTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customerA;
    private Customer $customerB;
    private Order $orderA;
    private string $tokenA;
    private string $tokenB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customerA = Customer::create(['name' => 'Customer A', 'phone' => '+9607660001']);
        $this->customerB = Customer::create(['name' => 'Customer B', 'phone' => '+9607660002']);

        $this->tokenA = $this->customerA->createToken('test', ['customer'])->plainTextToken;
        $this->tokenB = $this->customerB->createToken('test', ['customer'])->plainTextToken;

        $this->orderA = Order::create([
            'order_number'    => 'IDOR-001',
            'type'            => 'takeaway',
            'status'          => 'pending',
            'customer_id'     => $this->customerA->id,
            'subtotal'        => 100,
            'tax_amount'      => 0,
            'discount_amount' => 0,
            'total'           => 100,
        ]);
    }

    // ── Customer scope — own orders ────────────────────────────────────────────

    public function test_customer_can_view_own_order(): void
    {
        $this->getJson(
            "/api/customer/orders/{$this->orderA->id}",
            ['Authorization' => "Bearer {$this->tokenA}"],
        )->assertOk();
    }

    public function test_customer_cannot_view_another_customers_order(): void
    {
        // customerB tries to access customerA's order via the customer-scoped route
        $this->getJson(
            "/api/customer/orders/{$this->orderA->id}",
            ['Authorization' => "Bearer {$this->tokenB}"],
        )->assertStatus(404); // Scoped query returns 404 for orders they don't own
    }

    // ── Staff route — must reject customer tokens ─────────────────────────────

    public function test_customer_token_cannot_access_staff_order_route(): void
    {
        // Staff order route GET /api/orders/{id} must block customer tokens
        $this->getJson(
            "/api/orders/{$this->orderA->id}",
            ['Authorization' => "Bearer {$this->tokenA}"],
        )->assertStatus(403);
    }

    public function test_unauthenticated_request_cannot_access_staff_order_route(): void
    {
        $this->getJson("/api/orders/{$this->orderA->id}")
            ->assertStatus(401);
    }

    // ── Staff can access orders ────────────────────────────────────────────────

    public function test_staff_can_view_any_order(): void
    {
        $role  = Role::firstOrCreate(['slug' => 'manager'], ['name' => 'Manager', 'description' => '', 'is_active' => true]);
        $staff = User::create([
            'name'      => 'Manager',
            'email'     => 'manager-idor@test.com',
            'password'  => Hash::make('password'),
            'role_id'   => $role->id,
            'pin_hash'  => Hash::make('1234'),
            'is_active' => true,
        ]);

        Sanctum::actingAs($staff, ['staff']);

        $this->getJson("/api/orders/{$this->orderA->id}")->assertOk();
    }

    // ── Customer cannot enumerate orders ──────────────────────────────────────

    public function test_customer_order_list_only_returns_own_orders(): void
    {
        // Create an order for customerB
        Order::create([
            'order_number'    => 'IDOR-002',
            'type'            => 'takeaway',
            'status'          => 'pending',
            'customer_id'     => $this->customerB->id,
            'subtotal'        => 200,
            'tax_amount'      => 0,
            'discount_amount' => 0,
            'total'           => 200,
        ]);

        $response = $this->getJson(
            '/api/customer/orders',
            ['Authorization' => "Bearer {$this->tokenA}"],
        );

        if ($response->status() === 200) {
            $orderIds = array_column($response->json('data') ?? $response->json('orders') ?? [], 'id');
            foreach ($orderIds as $id) {
                $order = Order::find($id);
                $this->assertSame(
                    $this->customerA->id,
                    $order?->customer_id,
                    "Customer A should not see orders belonging to other customers."
                );
            }
        } else {
            // 401/404 are also acceptable — just not 200 with other customers' data
            $this->assertContains($response->status(), [401, 404]);
        }
    }
}
