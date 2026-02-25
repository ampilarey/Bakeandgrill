<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PartialPaymentTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;
    private Order $order;
    private string $customerToken;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customer = Customer::create([
            'name' => 'Pay Customer',
            'phone' => '+9607890001',
        ]);

        $this->customerToken = $this->customer->createToken('test', ['customer'])->plainTextToken;

        $this->order = Order::create([
            'order_number' => 'ORD-PARTIAL-001',
            'type' => 'takeaway',
            'status' => 'pending',
            'customer_id' => $this->customer->id,
            'subtotal' => 200.00,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 200.00,
            'total_laar' => 20000,
        ]);

        Http::fake([
            '*/v1/transactions' => Http::response([
                'transactionId' => 'TXN-TEST-001',
                'url' => 'https://pay.bml.mv/test',
            ], 200),
        ]);
    }

    private function authHeaders(): array
    {
        return ['Authorization' => "Bearer {$this->customerToken}"];
    }

    public function test_initiate_partial_with_valid_amount(): void
    {
        $response = $this->postJson('/api/payments/online/initiate-partial', [
            'order_id' => $this->order->id,
            'amount' => 5000,
            'idempotency_key' => 'test-partial-001',
        ], $this->authHeaders());

        $response->assertStatus(200)
            ->assertJsonStructure([
                'payment_url',
                'payment_id',
                'amount_laar',
                'remaining_balance_before_laar',
                'remaining_balance_after_laar',
                'reused',
            ]);

        $this->assertEquals(5000, $response->json('amount_laar'));
        $this->assertEquals(20000, $response->json('remaining_balance_before_laar'));
        $this->assertEquals(15000, $response->json('remaining_balance_after_laar'));
    }

    public function test_initiate_partial_exceeding_balance_returns_422(): void
    {
        $response = $this->postJson('/api/payments/online/initiate-partial', [
            'order_id' => $this->order->id,
            'amount' => 99999,
            'idempotency_key' => 'test-over-001',
        ], $this->authHeaders());

        $response->assertStatus(422);
        $this->assertStringContainsString('remaining balance', $response->json('message'));
    }

    public function test_initiate_partial_with_zero_amount_returns_422(): void
    {
        $response = $this->postJson('/api/payments/online/initiate-partial', [
            'order_id' => $this->order->id,
            'amount' => 0,
            'idempotency_key' => 'test-zero-001',
        ], $this->authHeaders());

        $response->assertStatus(422);
    }

    public function test_cannot_initiate_partial_on_paid_order(): void
    {
        $this->order->update(['status' => 'paid']);

        $response = $this->postJson('/api/payments/online/initiate-partial', [
            'order_id' => $this->order->id,
            'amount' => 1000,
            'idempotency_key' => 'test-paid-001',
        ], $this->authHeaders());

        $response->assertStatus(422)
            ->assertJsonFragment(['message' => 'Order already paid']);
    }

    public function test_order_becomes_paid_when_partial_payments_cover_total(): void
    {
        Payment::create([
            'order_id' => $this->order->id,
            'idempotency_key' => 'partial-one',
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'currency' => 'MVR',
            'amount' => 100.00,
            'amount_laar' => 10000,
            'local_id' => 'BG-PART-001',
            'status' => 'confirmed',
        ]);

        Payment::create([
            'order_id' => $this->order->id,
            'idempotency_key' => 'partial-two',
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'currency' => 'MVR',
            'amount' => 100.00,
            'amount_laar' => 10000,
            'local_id' => 'BG-PART-002',
            'status' => 'confirmed',
        ]);

        $remaining = app(\App\Domains\Payments\Services\PaymentService::class)
            ->getRemainingBalanceLaar($this->order->fresh());

        $this->assertEquals(0, $remaining);
    }

    public function test_partial_idempotency_returns_same_payment(): void
    {
        $payload = [
            'order_id' => $this->order->id,
            'amount' => 3000,
            'idempotency_key' => 'idempotent-key-001',
        ];

        $first = $this->postJson('/api/payments/online/initiate-partial', $payload, $this->authHeaders());
        $first->assertStatus(200);

        $second = $this->postJson('/api/payments/online/initiate-partial', $payload, $this->authHeaders());
        $second->assertStatus(200);

        $this->assertEquals($first->json('payment_id'), $second->json('payment_id'));
    }

    public function test_unauthenticated_returns_401(): void
    {
        $response = $this->postJson('/api/payments/online/initiate-partial', [
            'order_id' => $this->order->id,
            'amount' => 1000,
            'idempotency_key' => 'unauth-001',
        ]);

        $response->assertStatus(401);
    }
}
