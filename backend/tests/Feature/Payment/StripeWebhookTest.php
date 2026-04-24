<?php

declare(strict_types=1);

namespace Tests\Feature\Payment;

use App\Models\Order;
use App\Models\Payment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Tests for the Stripe webhook endpoint.
 *
 * Covers:
 *  - Valid signature + payment_intent.succeeded → order marked paid
 *  - Invalid / missing signature → HTTP 400, order unchanged
 *  - Duplicate event (same payment_intent id) → idempotent, no double payment
 *  - Unhandled event type → silently ignored, HTTP 200
 */
class StripeWebhookTest extends TestCase
{
    use RefreshDatabase;

    private const WEBHOOK_SECRET = 'whsec_test_secret_for_stripe_webhook_tests';

    private const STRIPE_ROUTE = '/api/stripe/webhook';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.stripe.webhook_secret' => self::WEBHOOK_SECRET]);
        config(['services.stripe.secret_key' => 'sk_test_placeholder']); // gitleaks:allow
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    private function makeTestOrder(string $status = 'payment_pending'): Order
    {
        $customer = $this->makeCustomer();

        return $this->makeOrder($customer, [
            'status' => $status,
            'total' => 50.00,
            'total_laar' => 5000,
        ]);
    }

    /**
     * Build a valid Stripe-signature header for the given body and timestamp.
     */
    private function stripeSignature(string $body, int $timestamp): string
    {
        $payload = $timestamp.'.'.$body;
        $sig = hash_hmac('sha256', $payload, self::WEBHOOK_SECRET);

        return "t={$timestamp},v1={$sig}";
    }

    private function makePaymentIntentEvent(string $piId, int $orderId, int $amountLaar = 5000): array
    {
        return [
            'id' => 'evt_'.$piId,
            'type' => 'payment_intent.succeeded',
            'data' => [
                'object' => [
                    'id' => $piId,
                    'amount' => $amountLaar,
                    'currency' => 'mvr',
                    'metadata' => ['order_id' => (string) $orderId],
                ],
            ],
        ];
    }

    private function postWebhook(string $body, string $sigHeader): \Illuminate\Testing\TestResponse
    {
        return $this->call(
            'POST',
            self::STRIPE_ROUTE,
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_Stripe-Signature' => $sigHeader,
            ],
            $body,
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Tests
    // ──────────────────────────────────────────────────────────────────────────

    public function test_valid_payment_intent_succeeded_creates_payment_record(): void
    {
        $order = $this->makeTestOrder('payment_pending');
        $piId = 'pi_valid_001';
        $body = json_encode($this->makePaymentIntentEvent($piId, $order->id, 5000));
        $ts = time();
        $sig = $this->stripeSignature($body, $ts);

        $response = $this->postWebhook($body, $sig);

        $this->assertSame(200, $response->status());
        $this->assertDatabaseHas('payments', [
            'idempotency_key' => 'stripe:'.$piId,
            'order_id' => $order->id,
            'method' => 'stripe',
            'status' => 'completed',
        ]);
    }

    public function test_invalid_signature_returns_400_and_order_unchanged(): void
    {
        $order = $this->makeTestOrder('payment_pending');
        $piId = 'pi_badsig_001';
        $body = json_encode($this->makePaymentIntentEvent($piId, $order->id));

        $response = $this->postWebhook($body, 't='.time().',v1=invalidsignature');

        $this->assertSame(400, $response->status());
        $this->assertDatabaseMissing('payments', ['idempotency_key' => 'stripe:'.$piId]);
        $this->assertSame('payment_pending', $order->fresh()->status);
    }

    public function test_missing_stripe_signature_header_returns_400(): void
    {
        $order = $this->makeTestOrder('payment_pending');
        $body = json_encode($this->makePaymentIntentEvent('pi_nosig_001', $order->id));

        $response = $this->call(
            'POST',
            self::STRIPE_ROUTE,
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/json'],
            $body,
        );

        $this->assertSame(400, $response->status());
    }

    public function test_duplicate_payment_intent_event_is_idempotent(): void
    {
        $order = $this->makeTestOrder('payment_pending');
        $piId = 'pi_dupe_001';
        $body = json_encode($this->makePaymentIntentEvent($piId, $order->id, 5000));
        $ts = time();
        $sig = $this->stripeSignature($body, $ts);

        // First call
        $this->postWebhook($body, $sig)->assertStatus(200);
        $paymentCountAfterFirst = Payment::count();

        // Second call with the same payload — must be idempotent
        // Stripe may re-deliver the same timestamp+body so we build a fresh sig
        $sig2 = $this->stripeSignature($body, $ts);
        $this->postWebhook($body, $sig2)->assertStatus(200);

        $this->assertSame(
            $paymentCountAfterFirst,
            Payment::count(),
            'Duplicate Stripe webhook must not create a second payment record.',
        );
    }

    public function test_stale_timestamp_returns_400(): void
    {
        $order = $this->makeTestOrder('payment_pending');
        $body = json_encode($this->makePaymentIntentEvent('pi_stale_001', $order->id));
        // Timestamp older than 5 minutes
        $ts = time() - 400;
        $sig = $this->stripeSignature($body, $ts);

        $response = $this->postWebhook($body, $sig);

        $this->assertSame(400, $response->status());
    }

    public function test_unhandled_event_type_returns_200_and_is_ignored(): void
    {
        $body = json_encode([
            'id' => 'evt_unknown',
            'type' => 'charge.refunded',
            'data' => ['object' => []],
        ]);
        $ts = time();
        $sig = $this->stripeSignature($body, $ts);

        $response = $this->postWebhook($body, $sig);

        $this->assertSame(200, $response->status());
    }

    public function test_webhook_for_unknown_order_id_returns_200_and_skips_gracefully(): void
    {
        $body = json_encode($this->makePaymentIntentEvent('pi_noorder_001', 99999));
        $ts = time();
        $sig = $this->stripeSignature($body, $ts);

        // Must not crash — order 99999 does not exist
        $response = $this->postWebhook($body, $sig);

        $this->assertSame(200, $response->status());
    }
}
