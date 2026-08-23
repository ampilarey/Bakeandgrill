<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Domains\Payments\Services\PaymentService;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A signed webhook that confirms the wrong amount.
 *
 * Settlement never reads the amount out of the payload — confirmPaymentOnce
 * settles the server-reserved `amount_laar` — so this is detection rather than
 * arithmetic. But a correctly signed webhook naming a different figure than we
 * reserved means either a gateway fault or a leaked signing secret, and
 * settling quietly would hide both. The return-url path already refuses on the
 * same mismatch; these tests hold the webhook path to it.
 *
 * The awkward part, and the reason the check is written the way it is: we send
 * laari, the status API answers in laari, but the webhook body carries a
 * decimal MVR string. So the check accepts a payload matching the reservation
 * read *either* way and flags only one that matches neither.
 */
class BmlWebhookAmountMismatchTest extends TestCase
{
    use RefreshDatabase;

    private string $secret = 'test-bml-webhook-secret';

    private Order $order;

    private Payment $payment;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'bml.webhook_secret' => $this->secret,
            'bml.enforce_signature' => true,
            'app.env' => 'testing',
        ]);

        $this->order = Order::create([
            'order_number' => 'BML-AMT-1',
            'type' => 'online_pickup',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'subtotal' => 100,
            'total' => 100,
            'total_laar' => 10000,
        ]);

        $this->payment = Payment::create([
            'idempotency_key' => 'bml:init:' . $this->order->id . ':amt',
            'order_id' => $this->order->id,
            'method' => 'bml_connect',
            'gateway' => 'bml',
            'currency' => 'MVR',
            'amount' => 100,
            'amount_laar' => 10000,
            'local_id' => 'BGAMT0001',
            'provider_transaction_id' => 'TXN-AMT-1',
            'status' => 'initiated',
            'processed_at' => now(),
        ]);
    }

    /** @param array<string, mixed> $payload */
    private function deliver(array $payload): void
    {
        $raw = json_encode($payload, JSON_THROW_ON_ERROR);
        $sig = hash_hmac('sha256', $raw, $this->secret);

        app(PaymentService::class)->handleBmlWebhook($raw, ['X-BML-Signature' => [$sig]]);
    }

    /** @return array<string, mixed> */
    private function payload(mixed $amount, string $txn = 'TXN-AMT-1'): array
    {
        return [
            'transactionId' => $txn,
            'localId' => $this->payment->local_id,
            'state' => 'CONFIRMED',
            'amount' => $amount,
            'currency' => 'MVR',
        ];
    }

    public function test_a_webhook_for_a_different_amount_does_not_settle_the_order(): void
    {
        // THE test. MVR 50 confirmed against an MVR 100 reservation matches
        // neither reading (5000 nor 50 is 10000), so it must not settle.
        $this->expectException(\RuntimeException::class);

        try {
            $this->deliver($this->payload('50.00'));
        } finally {
            $this->assertSame('initiated', $this->payment->fresh()->status);
            $this->assertSame('unpaid', $this->order->fresh()->payment_status);
        }
    }

    public function test_the_ordinary_mvr_decimal_body_still_settles(): void
    {
        // What BML actually sends. Read as MVR this is 10000 laari — the
        // reserved amount — so it settles. If this ever fails, the guard has
        // become stricter than the gateway and payments stop.
        $this->deliver($this->payload('100.00'));

        $this->assertSame('confirmed', $this->payment->fresh()->status);
    }

    public function test_a_laari_integer_body_also_settles(): void
    {
        // Tolerated deliberately: we send laari and the status API answers in
        // laari, so a webhook arriving in that unit is plausible and is not a
        // wrong amount.
        $this->deliver($this->payload(10000, 'TXN-AMT-2'));

        $this->assertSame('confirmed', $this->payment->fresh()->status);
    }

    public function test_a_body_with_no_amount_is_not_treated_as_a_mismatch(): void
    {
        // Some event shapes omit it. Inventing a failure here would strand a
        // real payment, and the amount is not what we settle on anyway.
        $payload = $this->payload(null, 'TXN-AMT-3');
        unset($payload['amount']);

        $this->deliver($payload);

        $this->assertSame('confirmed', $this->payment->fresh()->status);
    }

    public function test_a_mismatch_leaves_the_delivery_retryable(): void
    {
        // Failing closed is only safe if BML can retry once the cause is
        // fixed — a terminal 'processed' log would strand the payment.
        try {
            $this->deliver($this->payload('50.00'));
        } catch (\RuntimeException) {
            // expected
        }

        $log = \App\Models\WebhookLog::where('idempotency_key', 'bml:webhook:TXN-AMT-1')->first();
        $this->assertNotNull($log);
        $this->assertSame('failed', $log->status);
    }
}
