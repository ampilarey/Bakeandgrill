<?php

declare(strict_types=1);

namespace Tests\Contract;

use App\Models\Customer;
use App\Models\LoyaltyAccount;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * Contract/snapshot tests for the customer-facing API.
 *
 * Verifies response shapes for:
 *  - GET /api/customer/me
 *  - GET /api/customer/orders
 *  - GET /api/customer/orders/{id}
 *  - GET /api/loyalty/me
 */
class CustomerContractTest extends ContractTestCase
{
    use RefreshDatabase;

    /** Fields that vary between test runs and must not be snapshot-compared. */
    protected array $snapshotVolatileKeys = [
        'id', 'order_id', 'customer_id', 'user_id', 'device_id', 'token',
        'idempotency_key', 'created_at', 'updated_at', 'deleted_at', 'processed_at',
        'sent_at', 'completed_at', 'paid_at', 'tracking_token', 'order_number',
        // Customer-specific volatile fields
        'email', 'name', 'phone', 'last_order_at',
        // Order financial fields (random from factory)
        'subtotal', 'tax_amount', 'discount_amount', 'total', 'total_laar',
        'subtotal_laar', 'tax_laar', 'promo_discount_laar', 'delivery_fee',
        'delivery_fee_laar', 'loyalty_discount_laar', 'gift_card_discount_laar',
        // Loyalty fields
        'points_balance', 'lifetime_points', 'loyalty_points',
    ];

    private Customer $customer;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customer = Customer::factory()->withPassword()->create([
            'name' => 'Test Customer',
            'phone' => '+9607550001',
            'tier' => 'bronze',
            'loyalty_points' => 50,
        ]);

        $this->token = $this->customer->createToken('test', ['customer'])->plainTextToken;
    }

    private function localCustomerAuthHeaders(): array
    {
        return ['Authorization' => "Bearer {$this->token}"];
    }

    // ── GET /api/customer/me ──────────────────────────────────────────────────

    public function test_customer_me_response_shape(): void
    {
        $response = $this->getJson('/api/customer/me', $this->localCustomerAuthHeaders())
            ->assertStatus(200);

        $this->assertMatchesApiSnapshot($response, 'customer.me');
    }

    public function test_customer_me_requires_auth(): void
    {
        $this->getJson('/api/customer/me')->assertStatus(401);
    }

    public function test_customer_me_customer_token_only(): void
    {
        // Staff token should be rejected on customer routes
        $staff = $this->makeOwner();
        $staffToken = $staff->createToken('test', ['staff'])->plainTextToken;

        $this->getJson('/api/customer/me', ['Authorization' => "Bearer {$staffToken}"])
            ->assertStatus(403);
    }

    // ── GET /api/customer/orders ──────────────────────────────────────────────

    public function test_customer_orders_list_response_shape(): void
    {
        // Create one order for the customer so the list is non-empty
        Order::factory()->pending()->create([
            'customer_id' => $this->customer->id,
            'total' => 25.00,
        ]);

        $response = $this->getJson('/api/customer/orders', $this->localCustomerAuthHeaders())
            ->assertStatus(200);

        $this->assertMatchesApiSnapshot($response, 'customer.orders.list');
    }

    public function test_customer_orders_returns_empty_list_for_new_customer(): void
    {
        $response = $this->getJson('/api/customer/orders', $this->localCustomerAuthHeaders())
            ->assertStatus(200);

        // API returns paginated response; data array is empty for new customer
        $data = $response->json();
        $items = $data['data'] ?? $data['orders'] ?? [];
        $this->assertEmpty($items, 'A new customer should have zero orders');
    }

    // ── GET /api/customer/orders/{id} ─────────────────────────────────────────

    public function test_customer_order_detail_response_shape(): void
    {
        $order = Order::factory()->pending()->create([
            'customer_id' => $this->customer->id,
            'total' => 30.00,
        ]);

        $response = $this->getJson("/api/customer/orders/{$order->id}", $this->localCustomerAuthHeaders())
            ->assertStatus(200);

        $this->assertMatchesApiSnapshot($response, 'customer.orders.detail');
    }

    public function test_customer_cannot_view_another_customers_order(): void
    {
        $other = Customer::factory()->create(['phone' => '+9607550002']);
        $order = Order::factory()->pending()->create(['customer_id' => $other->id, 'total' => 10.00]);

        // Returns 404 (scoped query — other customer's orders are simply not found)
        $this->getJson("/api/customer/orders/{$order->id}", $this->localCustomerAuthHeaders())
            ->assertStatus(404);
    }

    // ── GET /api/loyalty/me ───────────────────────────────────────────────────

    public function test_loyalty_me_response_shape(): void
    {
        LoyaltyAccount::firstOrCreate(
            ['customer_id' => $this->customer->id],
            ['points_balance' => 50, 'tier' => 'bronze', 'lifetime_points' => 50],
        );

        $response = $this->getJson('/api/loyalty/me', $this->localCustomerAuthHeaders())
            ->assertStatus(200);

        $this->assertMatchesApiSnapshot($response, 'customer.loyalty.me');
    }
}
