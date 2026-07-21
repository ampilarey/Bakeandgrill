<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use App\Models\WebhookLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * FIX 12 — HMAC signature MUST be verified BEFORE minting a WebhookLog
 * row. Otherwise a forged webhook can claim the idempotency key for a
 * given transactionId and a later genuine delivery gets silently dropped
 * as a duplicate.
 */
class BmlWebhookSignatureBeforeLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_forged_webhook_does_not_block_subsequent_genuine_delivery(): void
    {
        $secret = 'unit-test-webhook-secret';
        config([
            'bml.enforce_signature' => true,
            'bml.webhook_secret' => $secret,
            'app.env' => 'production',
        ]);

        $customer = Customer::create([
            'name' => 'FIX12 Customer',
            'phone' => '+9607450012',
        ]);
        $order = Order::create([
            'order_number' => 'FIX12-1',
            'type' => 'takeaway',
            'status' => 'pending',
            'customer_id' => $customer->id,
            'subtotal' => 90.00,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 90.00,
            'total_laar' => 9000,
        ]);
        $payment = Payment::create([
            'order_id' => $order->id,
            'method' => 'bml',
            'amount' => 90.00,
            'amount_laar' => 9000,
            'status' => 'initiated',
            'idempotency_key' => 'bml:init:' . $order->id . ':fix12',
            'local_id' => 'LOCAL-FIX12-1',
            'provider_transaction_id' => 'TXN-FIX12-1',
        ]);

        $transactionId = 'TXN-FIX12-1';
        $body = json_encode([
            'transactionId' => $transactionId,
            'localId' => $payment->local_id,
            'state' => 'CONFIRMED',
            'amount' => '90.00',
            'currency' => 'MVR',
        ]);

        // 1) Forged delivery (bad signature) — must be rejected, no WebhookLog row created.
        $forged = $this->call(
            'POST',
            '/api/payments/bml/webhook',
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/json', 'HTTP_X-BML-Signature' => 'nope-not-genuine'],
            $body,
        );
        $this->assertSame(503, $forged->status(), 'Forged webhook must be rejected');
        $this->assertDatabaseMissing('webhook_logs', [
            'idempotency_key' => 'bml:webhook:' . $transactionId,
        ]);
        $this->assertNotContains(
            $order->fresh()->status,
            ['paid', 'completed'],
        );

        // 2) Genuine delivery with valid signature — must process and confirm the payment.
        $signature = hash_hmac('sha256', $body, $secret);
        $genuine = $this->call(
            'POST',
            '/api/payments/bml/webhook',
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/json', 'HTTP_X-BML-Signature' => $signature],
            $body,
        );
        $this->assertSame(200, $genuine->status());
        $this->assertDatabaseHas('webhook_logs', [
            'gateway' => 'bml',
            'idempotency_key' => 'bml:webhook:' . $transactionId,
            'status' => 'processed',
        ]);
    }
}
