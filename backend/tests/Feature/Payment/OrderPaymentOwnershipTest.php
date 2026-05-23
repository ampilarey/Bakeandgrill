<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Models\Customer;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrderPaymentOwnershipTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customerA;

    private Customer $customerB;

    private string $tokenA;

    private string $tokenB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customerA = Customer::create(['name' => 'Payer A', 'phone' => '+9607661001']);
        $this->customerB = Customer::create(['name' => 'Payer B', 'phone' => '+9607661002']);

        $this->tokenA = $this->customerA->createToken('test', ['customer'])->plainTextToken;
        $this->tokenB = $this->customerB->createToken('test', ['customer'])->plainTextToken;
    }

    public function test_customer_cannot_initiate_bml_payment_for_another_customers_order(): void
    {
        $order = Order::create([
            'order_number' => 'PAY-IDOR-001',
            'type' => 'online_pickup',
            'status' => 'payment_pending',
            'customer_id' => $this->customerA->id,
            'subtotal' => 100,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 100,
            'total_laar' => 10000,
        ]);

        $this->postJson(
            "/api/orders/{$order->id}/pay/bml",
            [],
            ['Authorization' => "Bearer {$this->tokenB}"],
        )->assertForbidden();
    }

    public function test_customer_cannot_complete_zero_balance_for_another_customers_order(): void
    {
        $order = Order::create([
            'order_number' => 'PAY-IDOR-002',
            'type' => 'online_pickup',
            'status' => 'payment_pending',
            'customer_id' => $this->customerA->id,
            'subtotal' => 0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 0,
            'total_laar' => 0,
        ]);

        $this->postJson(
            "/api/orders/{$order->id}/complete-zero-balance",
            [],
            ['Authorization' => "Bearer {$this->tokenB}"],
        )->assertForbidden();
    }

    public function test_customer_can_complete_zero_balance_for_own_order(): void
    {
        $order = Order::create([
            'order_number' => 'PAY-ZERO-001',
            'type' => 'online_pickup',
            'status' => 'payment_pending',
            'customer_id' => $this->customerA->id,
            'subtotal' => 0,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 0,
            'total_laar' => 0,
        ]);

        $this->postJson(
            "/api/orders/{$order->id}/complete-zero-balance",
            [],
            ['Authorization' => "Bearer {$this->tokenA}"],
        )->assertOk()
            ->assertJsonPath('order.status', 'pending')
            ->assertJsonPath('order.payment_status', 'paid');
    }
}
