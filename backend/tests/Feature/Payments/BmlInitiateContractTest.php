<?php

declare(strict_types=1);

namespace Tests\Feature\Payments;

use App\Models\Customer;
use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Contract guard for BML partial-initiate response — shape must stay stable
 * for the online-order checkout client.
 */
class BmlInitiateContractTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Order $order;

    private string $customerToken;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customer = Customer::create([
            'name' => 'BML Contract',
            'phone' => '+9607890099',
        ]);

        $this->customerToken = $this->customer->createToken('test', ['customer'])->plainTextToken;

        $this->order = Order::create([
            'order_number' => 'ORD-BML-CONTRACT',
            'type' => 'takeaway',
            'status' => 'pending',
            'customer_id' => $this->customer->id,
            'subtotal' => 150.00,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 150.00,
            'total_laar' => 15000,
        ]);

        Http::fake([
            '*/v2/transactions' => Http::response([
                'transactionId' => 'TXN-CONTRACT-001',
                'url' => 'https://pay.bml.mv/contract-test',
            ], 200),
        ]);
    }

    public function test_initiate_partial_response_contract(): void
    {
        $response = $this->postJson('/api/payments/online/initiate-partial', [
            'order_id' => $this->order->id,
            'amount' => 7500,
            'idempotency_key' => 'bml-contract-' . $this->order->id,
        ], ['Authorization' => "Bearer {$this->customerToken}"]);

        $response->assertOk()
            ->assertJsonStructure([
                'payment_url',
                'payment_id',
                'amount_laar',
                'remaining_balance_before_laar',
                'remaining_balance_after_laar',
                'reused',
            ]);

        $json = $response->json();
        $this->assertIsString($json['payment_url']);
        $this->assertStringStartsWith('https://', $json['payment_url']);
        $this->assertIsInt($json['payment_id']);
        $this->assertSame(7500, $json['amount_laar']);
        $this->assertSame(15000, $json['remaining_balance_before_laar']);
        $this->assertSame(7500, $json['remaining_balance_after_laar']);
        $this->assertIsBool($json['reused']);
    }
}
