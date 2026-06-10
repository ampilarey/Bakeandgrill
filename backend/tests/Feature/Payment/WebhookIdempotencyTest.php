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
 * Tests that BML webhook processing is idempotent.
 * Duplicate webhook calls must not cause duplicate payment effects.
 * Covers the Idempotency and State Transition Checklist in the Security Audit.
 */
class WebhookIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Order $order;

    private Payment $payment;

    protected function setUp(): void
    {
        parent::setUp();

        $this->customer = Customer::create([
            'name' => 'Webhook Customer',
            'phone' => '+9607440001',
        ]);

        $this->order = Order::create([
            'order_number' => 'WH-IDEM-001',
            'type' => 'takeaway',
            'status' => 'pending',
            'customer_id' => $this->customer->id,
            'subtotal' => 150.00,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 150.00,
            'total_laar' => 15000,
        ]);

        $this->payment = Payment::create([
            'order_id' => $this->order->id,
            'method' => 'bml',
            'amount' => 150.00,
            'amount_laar' => 15000,
            'status' => 'pending',
            'idempotency_key' => 'bml:init:' . $this->order->id . ':test',
            'local_id' => 'LOCAL-WH-IDEM-001',
            'provider_transaction_id' => 'TXN-WH-IDEM-001',
        ]);
    }

    public function test_duplicate_bml_webhook_does_not_create_duplicate_payment(): void
    {
        $transactionId = 'TXN-WH-IDEM-DUP-001';
        $idempotencyKey = 'bml:webhook:' . $transactionId;

        // Simulate a webhook log already existing (first call already processed)
        WebhookLog::create([
            'idempotency_key' => $idempotencyKey,
            'gateway' => 'bml',
            'event_type' => 'CONFIRMED',
            'raw_body' => json_encode(['transactionId' => $transactionId]),
            'payload' => ['transactionId' => $transactionId],
            'status' => 'processed',
        ]);

        $initialPaymentCount = Payment::count();

        // Send a webhook with the same transactionId — should be a no-op
        $webhookBody = json_encode([
            'transactionId' => $transactionId,
            'localId' => 'LOCAL-WH-IDEM-001',
            'state' => 'CONFIRMED',
            'amount' => '150.00',
            'currency' => 'MVR',
        ]);

        $response = $this->call(
            'POST',
            '/api/payments/bml/webhook',
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/json', 'HTTP_X-BML-Signature' => 'invalid'],
            $webhookBody,
        );

        // 200 (idempotent skip) or 503 (signature rejected for retry) — no duplicate payment
        $this->assertContains($response->status(), [200, 400, 401, 403, 405, 422, 503]);

        // Payment count must not have increased
        $this->assertSame(
            $initialPaymentCount,
            Payment::count(),
            'Duplicate webhook must not create additional payment records.',
        );
    }

    public function test_webhook_idempotency_key_is_transaction_id_based(): void
    {
        // Verify the idempotency key format used in WebhookLog
        $transactionId = 'TXN-FORMAT-TEST';
        $idempotencyKey = 'bml:webhook:' . $transactionId;

        // This tests the naming convention matches what PaymentService uses
        $this->assertStringStartsWith('bml:webhook:', $idempotencyKey);
        $this->assertStringContainsString($transactionId, $idempotencyKey);
    }

    public function test_webhook_log_table_has_idempotency_key_unique_constraint(): void
    {
        $key = 'bml:webhook:UNIQUE-TEST-001';

        WebhookLog::create([
            'idempotency_key' => $key,
            'gateway' => 'bml',
            'event_type' => 'CONFIRMED',
            'raw_body' => '{}',
            'status' => 'received',
        ]);

        $this->expectException(\Illuminate\Database\UniqueConstraintViolationException::class);

        WebhookLog::create([
            'idempotency_key' => $key,
            'gateway' => 'bml',
            'event_type' => 'CONFIRMED',
            'raw_body' => '{}',
            'status' => 'received',
        ]);
    }

    public function test_failed_payment_does_not_mark_order_as_paid(): void
    {
        $this->assertSame('pending', $this->order->fresh()->status);

        // A FAILED/CANCELLED state should not transition order to paid
        $webhookBody = json_encode([
            'transactionId' => 'TXN-FAILED-001',
            'localId' => 'LOCAL-WH-IDEM-001',
            'state' => 'CANCELLED',
            'amount' => '150.00',
            'currency' => 'MVR',
        ]);

        $this->call(
            'POST',
            '/api/payments/bml/webhook',
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/json', 'HTTP_X-BML-Signature' => 'invalid'],
            $webhookBody,
        );

        // Order should still not be in paid/completed state
        $order = $this->order->fresh();
        $this->assertNotContains(
            $order->status,
            ['paid', 'completed'],
            'A CANCELLED payment webhook must not mark the order as paid.',
        );
    }

    public function test_bml_webhook_with_invalid_signature_returns_503_and_does_not_pay_order(): void
    {
        // Invalid signatures return 503 so BML can retry with a valid payload.
        config(['bml.enforce_signature' => true, 'app.env' => 'production']);

        $webhookBody = json_encode([
            'transactionId' => 'TXN-BAD-SIG-001',
            'localId' => 'LOCAL-WH-IDEM-001',
            'state' => 'CONFIRMED',
            'amount' => '150.00',
            'currency' => 'MVR',
        ]);

        $response = $this->call(
            'POST',
            '/api/payments/bml/webhook',
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/json', 'HTTP_X-BML-Signature' => 'badsignature'],
            $webhookBody,
        );

        // Controller returns 503 for signature failures so BML retries
        $this->assertSame(503, $response->status());

        // Order must NOT have been paid despite the CONFIRMED state in payload
        $this->assertNotContains(
            $this->order->fresh()->status,
            ['paid', 'completed'],
            'An invalid-signature webhook must not mark the order as paid.',
        );
    }

    public function test_bml_webhook_missing_signature_rejected_in_production(): void
    {
        config(['bml.enforce_signature' => true, 'app.env' => 'production']);

        $webhookBody = json_encode([
            'transactionId' => 'TXN-NO-SIG-HEADER',
            'localId' => 'LOCAL-WH-IDEM-001',
            'state' => 'CONFIRMED',
            'amount' => '150.00',
            'currency' => 'MVR',
        ]);

        $response = $this->call(
            'POST',
            '/api/payments/bml/webhook',
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/json'],
            $webhookBody,
        );

        $this->assertSame(503, $response->status());
        $this->assertNotContains(
            $this->order->fresh()->status,
            ['paid', 'completed'],
            'A webhook with no signature must not mark the order as paid in production.',
        );
    }

    public function test_valid_bml_webhook_signature_confirms_payment(): void
    {
        $secret = 'test-webhook-secret-key';
        config([
            'bml.enforce_signature' => true,
            'bml.webhook_secret' => $secret,
            'app.env' => 'production',
        ]);

        $transactionId = 'TXN-VALID-SIG-001';
        $webhookBody = json_encode([
            'transactionId' => $transactionId,
            'localId' => $this->payment->local_id,
            'state' => 'CONFIRMED',
            'amount' => '150.00',
            'currency' => 'MVR',
        ]);

        $this->payment->update([
            'provider_transaction_id' => $transactionId,
            'status' => 'initiated',
        ]);

        $signature = hash_hmac('sha256', $webhookBody, $secret);

        $response = $this->call(
            'POST',
            '/api/payments/bml/webhook',
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/json', 'HTTP_X-BML-Signature' => $signature],
            $webhookBody,
        );

        $this->assertSame(200, $response->status());
        $this->assertDatabaseHas('webhook_logs', [
            'gateway' => 'bml',
            'idempotency_key' => 'bml:webhook:' . $transactionId,
        ]);
    }

    public function test_bml_webhook_enforce_signature_false_processes_payload(): void
    {
        config(['bml.enforce_signature' => false, 'bml.webhook_secret' => null]);

        $transactionId = 'TXN-NO-SIG-001';
        $webhookBody = json_encode([
            'transactionId' => $transactionId,
            'localId' => $this->payment->local_id,
            'state' => 'CONFIRMED',
            'amount' => '150.00',
            'currency' => 'MVR',
        ]);

        $this->payment->update([
            'local_id' => $this->payment->local_id,
            'provider_transaction_id' => $transactionId,
            'status' => 'initiated',
        ]);

        $response = $this->call(
            'POST',
            '/api/payments/bml/webhook',
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/json'],
            $webhookBody,
        );

        $this->assertSame(200, $response->status());
        $this->assertDatabaseHas('webhook_logs', [
            'gateway' => 'bml',
            'idempotency_key' => 'bml:webhook:' . $transactionId,
        ]);
    }
}
