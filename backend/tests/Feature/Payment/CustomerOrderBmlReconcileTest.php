<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Food-order GET show must reconcile pending BML the same way gift-card
 * purchaseStatus does — TEST often misses webhooks and return URL is fail-closed.
 */
class CustomerOrderBmlReconcileTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Order $order;

    private Payment $payment;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customer = Customer::create([
            'name' => 'Reconcile Customer',
            'phone' => '+9607442002',
            'is_active' => true,
        ]);

        $this->order = Order::create([
            'order_number' => 'REC-BML-001',
            'type' => 'online_pickup',
            'status' => 'payment_pending',
            'payment_status' => 'unpaid',
            'customer_id' => $this->customer->id,
            'subtotal' => 85.00,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 85.00,
            'total_laar' => 8500,
        ]);

        $this->payment = Payment::create([
            'order_id' => $this->order->id,
            'method' => 'bml',
            'amount' => 85.00,
            'amount_laar' => 8500,
            'status' => 'pending',
            'local_id' => 'LOCAL-REC-BML-001',
            'provider_transaction_id' => 'TXN-REC-BML-001',
        ]);
    }

    public function test_customer_order_show_reconciles_when_bml_status_confirmed(): void
    {
        $mock = \Mockery::mock(\App\Domains\Payments\Gateway\BmlConnectService::class);
        $mock->shouldReceive('getTransactionStatus')
            ->once()
            ->with('TXN-REC-BML-001')
            ->andReturn([
                'state' => 'CONFIRMED',
                'transactionId' => 'TXN-REC-BML-001',
                'amount' => 8500,
            ]);
        $this->app->instance(\App\Domains\Payments\Gateway\BmlConnectService::class, $mock);

        Sanctum::actingAs($this->customer, ['customer']);

        $res = $this->getJson("/api/customer/orders/{$this->order->id}");
        $res->assertOk();
        $res->assertJsonPath('order.payment_status', 'paid');
        $res->assertJsonPath('order.status', 'pending');

        $this->assertContains($this->payment->fresh()->status, ['confirmed', 'paid', 'completed']);
        $this->assertNotNull($this->order->fresh()->paid_at);
    }

    public function test_customer_order_show_leaves_unpaid_when_bml_not_confirmed(): void
    {
        $mock = \Mockery::mock(\App\Domains\Payments\Gateway\BmlConnectService::class);
        $mock->shouldReceive('getTransactionStatus')
            ->once()
            ->andReturn([
                'state' => 'PENDING',
                'transactionId' => 'TXN-REC-BML-001',
            ]);
        $this->app->instance(\App\Domains\Payments\Gateway\BmlConnectService::class, $mock);

        Sanctum::actingAs($this->customer, ['customer']);

        $res = $this->getJson("/api/customer/orders/{$this->order->id}");
        $res->assertOk();
        $res->assertJsonPath('order.payment_status', 'unpaid');
        $res->assertJsonPath('order.status', 'payment_pending');
        $this->assertSame('pending', $this->payment->fresh()->status);
    }
}
