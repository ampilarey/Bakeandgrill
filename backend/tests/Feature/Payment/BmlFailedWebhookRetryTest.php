<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Domains\Payments\Services\PaymentService;
use App\Models\Order;
use App\Models\Payment;
use App\Models\WebhookLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Audit #2 — failed BML webhooks must be reclaimable and settle exactly once.
 */
class BmlFailedWebhookRetryTest extends TestCase
{
    use RefreshDatabase;

    private Order $order;

    private Payment $payment;

    private string $secret = 'test-bml-webhook-secret';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'bml.webhook_secret' => $this->secret,
            'bml.enforce_signature' => true,
            'bml.base_url' => 'https://api.merchants.bankofmaldives.com.mv/public',
            'app.env' => 'testing',
        ]);

        $this->order = Order::create([
            'order_number' => 'BML-WH-RETRY',
            'type' => 'online_pickup',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'subtotal' => 100,
            'total' => 100,
            'total_laar' => 10000,
        ]);

        $this->payment = Payment::create([
            'idempotency_key' => 'bml:init:' . $this->order->id . ':test',
            'order_id' => $this->order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'currency' => 'MVR',
            'amount' => 100,
            'amount_laar' => 10000,
            'local_id' => 'BGWHRETRY001',
            'provider_transaction_id' => 'TXN-WH-RETRY-1',
            'status' => 'initiated',
            'processed_at' => now(),
        ]);
    }

    private function signedBody(array $payload): array
    {
        $raw = json_encode($payload, JSON_THROW_ON_ERROR);
        $sig = hash_hmac('sha256', $raw, $this->secret);

        return [$raw, $sig];
    }

    public function test_failed_webhook_is_reprocessed_on_retry_and_settles_once(): void
    {
        $payload = [
            'transactionId' => 'TXN-WH-RETRY-1',
            'localId' => $this->payment->local_id,
            'state' => 'CONFIRMED',
            'amount' => '100.00',
            'currency' => 'MVR',
        ];
        [$raw, $sig] = $this->signedBody($payload);
        $headers = ['X-BML-Signature' => [$sig]];

        WebhookLog::create([
            'idempotency_key' => 'bml:webhook:TXN-WH-RETRY-1',
            'gateway' => 'bml',
            'gateway_event_id' => 'TXN-WH-RETRY-1',
            'event_type' => 'CONFIRMED',
            'headers' => [],
            'raw_body' => $raw,
            'payload' => $payload,
            'status' => 'failed',
            'attempt_count' => 1,
            'error_message' => '[attempt 1] simulated mid-flight failure',
        ]);

        app(PaymentService::class)->handleBmlWebhook($raw, $headers);

        $this->assertSame('confirmed', $this->payment->fresh()->status);
        $log = WebhookLog::where('idempotency_key', 'bml:webhook:TXN-WH-RETRY-1')->first();
        $this->assertSame('processed', $log->status);
        $this->assertSame(2, (int) $log->attempt_count);

        // Duplicate successful delivery must not double-settle.
        app(PaymentService::class)->handleBmlWebhook($raw, $headers);
        $this->assertSame(1, Payment::where('order_id', $this->order->id)->where('status', 'confirmed')->count());
        $this->assertSame('processed', $log->fresh()->status);
    }

    public function test_processed_duplicate_is_ignored(): void
    {
        $payload = [
            'transactionId' => 'TXN-WH-RETRY-1',
            'localId' => $this->payment->local_id,
            'state' => 'CONFIRMED',
            'amount' => '100.00',
            'currency' => 'MVR',
        ];
        [$raw, $sig] = $this->signedBody($payload);

        $this->payment->update(['status' => 'confirmed']);
        WebhookLog::create([
            'idempotency_key' => 'bml:webhook:TXN-WH-RETRY-1',
            'gateway' => 'bml',
            'gateway_event_id' => 'TXN-WH-RETRY-1',
            'event_type' => 'CONFIRMED',
            'headers' => [],
            'raw_body' => $raw,
            'payload' => $payload,
            'status' => 'processed',
            'attempt_count' => 1,
            'processed_at' => now(),
        ]);

        app(PaymentService::class)->handleBmlWebhook($raw, ['X-BML-Signature' => [$sig]]);

        $this->assertSame(1, (int) WebhookLog::where('idempotency_key', 'bml:webhook:TXN-WH-RETRY-1')->value('attempt_count'));
    }
}
