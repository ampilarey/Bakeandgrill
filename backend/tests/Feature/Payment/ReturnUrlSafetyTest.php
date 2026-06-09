<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * BML return URL must not finalize payment without a verified webhook.
 */
class ReturnUrlSafetyTest extends TestCase
{
    use RefreshDatabase;

    private Order $order;

    private Payment $payment;

    protected function setUp(): void
    {
        parent::setUp();

        $customer = Customer::create([
            'name' => 'Return URL Customer',
            'phone' => '+9607441001',
        ]);

        $this->order = Order::create([
            'order_number' => 'RET-URL-001',
            'type' => 'takeaway',
            'status' => 'pending',
            'customer_id' => $customer->id,
            'subtotal' => 100.00,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 100.00,
            'total_laar' => 10000,
        ]);

        $this->payment = Payment::create([
            'order_id' => $this->order->id,
            'method' => 'bml',
            'amount' => 100.00,
            'amount_laar' => 10000,
            'status' => 'pending',
            'local_id' => 'LOCAL-RET-URL-001',
            'transaction_id' => 'TXN-RET-URL-001',
        ]);
    }

    public function test_return_url_get_does_not_mark_order_paid_without_webhook(): void
    {
        $response = $this->get('/payments/bml/return?localId=' . urlencode($this->payment->local_id));

        $this->assertNotSame(500, $response->status());

        $this->assertNotContains(
            $this->order->fresh()->status,
            ['paid', 'completed'],
            'Return URL alone must not finalize payment.',
        );

        $this->assertSame('pending', $this->payment->fresh()->status);
    }

    public function test_confirmed_return_query_without_webhook_does_not_finalize_payment(): void
    {
        $this->get('/payments/bml/return?' . http_build_query([
            'orderId' => $this->order->id,
            'state' => 'CONFIRMED',
            'transactionId' => $this->payment->transaction_id,
        ]));

        $this->assertNotContains(
            $this->order->fresh()->status,
            ['paid', 'completed'],
            'Return URL with CONFIRMED params must not finalize without verified BML status.',
        );

        $this->assertSame('pending', $this->payment->fresh()->status);
    }
}
