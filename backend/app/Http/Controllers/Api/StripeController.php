<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Payments\DTOs\PaymentConfirmedData;
use App\Domains\Payments\Events\PaymentConfirmed;
use App\Domains\Payments\Gateway\StripeService;
use App\Domains\Payments\Services\PaymentService;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use App\Services\ShiftAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class StripeController extends Controller
{
    /** Server-fixed currency — never trust a caller-supplied value. */
    private const CURRENCY = 'mvr';

    /** @var list<string> */
    private const REUSABLE_INTENT_STATUSES = [
        'requires_payment_method',
        'requires_confirmation',
        'requires_action',
        'processing',
    ];

    public function __construct(
        private StripeService $stripe,
        private PaymentService $payments,
    ) {}

    /**
     * Create (or reuse) a PaymentIntent for the remaining balance of an order.
     * Returns client_secret to the frontend to complete payment.
     */
    public function createIntent(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'order_id' => ['required', 'integer', 'exists:orders,id'],
        ]);

        $user = $request->user();

        // Staff path mirrors POS delivery: ring_sales + open shift.
        // Device checks run via `device.active.staff` middleware on this route.
        if ($user instanceof User) {
            if (!$user->hasPermission('pos.ring_sales')) {
                return response()->json(['message' => 'Forbidden.'], 403);
            }
            app(ShiftAccessService::class)->requireOpenShift(
                $user,
                'Open a shift before taking payments.',
            );
        } elseif (!($user instanceof Customer)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return DB::transaction(function () use ($validated, $user): JsonResponse {
            $order = Order::lockForUpdate()->findOrFail($validated['order_id']);

            if ($user instanceof Customer && $order->customer_id !== $user->id) {
                return response()->json(['message' => 'Forbidden.'], 403);
            }

            if (in_array($order->status, ['cancelled', 'refunded', 'completed'], true)
                || $order->payment_status === 'paid') {
                abort(422, 'This order is not awaiting payment.');
            }

            $amountLaar = $this->payments->getRemainingBalanceLaar($order);
            if ($amountLaar <= 0) {
                abort(422, 'This order is already fully paid.');
            }

            $baseKey = 'stripe:intent:' . $order->id . ':' . $amountLaar;
            $existing = Payment::query()
                ->where('idempotency_key', $baseKey)
                ->where('gateway', 'stripe')
                ->lockForUpdate()
                ->first();

            if ($existing?->provider_transaction_id) {
                $reuse = $this->tryReuseStripeIntent($existing, $order);
                if ($reuse !== null) {
                    return $reuse;
                }

                // Prior PI is dead (canceled/failed) — never overwrite its provider id.
                // Mint a sibling row under a retry key so delayed webhooks for the
                // original PI can still settle the original local payment.
                $baseKey = $baseKey . ':retry:' . $existing->id;
                $existing = Payment::query()
                    ->where('idempotency_key', $baseKey)
                    ->where('gateway', 'stripe')
                    ->lockForUpdate()
                    ->first();

                if ($existing?->provider_transaction_id) {
                    $reuse = $this->tryReuseStripeIntent($existing, $order);
                    if ($reuse !== null) {
                        return $reuse;
                    }
                    // Exhausted retry row — leave it immutable and fail closed.
                    abort(409, 'A previous card payment is still reconciling. Please wait or contact staff.');
                }
            }

            // Locally completed without needing Stripe re-check.
            if ($existing && in_array((string) $existing->status, ['completed', 'paid', 'confirmed'], true)) {
                return response()->json([
                    'payment_intent_id' => $existing->provider_transaction_id,
                    'status' => 'succeeded',
                    'already_paid' => true,
                    'reused' => true,
                ]);
            }

            $result = $this->stripe->createPaymentIntent(
                $amountLaar,
                self::CURRENCY,
                (string) $order->id,
                $baseKey,
            );

            if ($existing) {
                // Only attach a PI when the row has none yet (never replace).
                if ($existing->provider_transaction_id
                    && $existing->provider_transaction_id !== ($result['payment_intent_id'] ?? null)) {
                    abort(409, 'A previous card payment is still reconciling. Please wait or contact staff.');
                }

                $existing->update([
                    'order_id' => $order->id,
                    'method' => 'stripe',
                    'gateway' => 'stripe',
                    'currency' => strtoupper(self::CURRENCY),
                    'amount' => round($amountLaar / 100, 2),
                    'amount_laar' => $amountLaar,
                    'provider_transaction_id' => $result['payment_intent_id'] ?? $existing->provider_transaction_id,
                    'status' => 'pending',
                    'processed_at' => now(),
                ]);
            } else {
                Payment::create([
                    'idempotency_key' => $baseKey,
                    'order_id' => $order->id,
                    'method' => 'stripe',
                    'gateway' => 'stripe',
                    'currency' => strtoupper(self::CURRENCY),
                    'amount' => round($amountLaar / 100, 2),
                    'amount_laar' => $amountLaar,
                    'provider_transaction_id' => $result['payment_intent_id'] ?? null,
                    'status' => 'pending',
                    'processed_at' => now(),
                ]);
            }

            return response()->json($result + ['reused' => false]);
        });
    }

    /**
     * Stripe webhook — receives payment events and updates order status.
     * Must be public (no auth) and must receive raw body for signature verification.
     */
    public function webhook(Request $request): Response
    {
        $sigHeader = $request->header('Stripe-Signature', '');
        $rawBody = $request->getContent();

        try {
            $event = $this->stripe->verifyWebhook($rawBody, $sigHeader);
        } catch (\RuntimeException $e) {
            return response($e->getMessage(), 400);
        }

        if ($event['type'] === 'payment_intent.succeeded') {
            $pi = $event['data']['object'];
            $orderId = (int) ($pi['metadata']['order_id'] ?? 0);
            $amount = (int) ($pi['amount'] ?? 0);
            $currency = strtolower((string) ($pi['currency'] ?? self::CURRENCY));

            if ($orderId) {
                DB::transaction(function () use ($pi, $orderId, $amount, $currency): void {
                    $order = Order::lockForUpdate()->find($orderId);
                    if (!$order) {
                        return;
                    }

                    $pending = Payment::query()
                        ->where('provider_transaction_id', $pi['id'])
                        ->where('order_id', $order->id)
                        ->where('gateway', 'stripe')
                        ->lockForUpdate()
                        ->first();

                    if (!$pending) {
                        Log::warning('Stripe webhook: no matching local pending intent — ignoring', [
                            'order_id' => $order->id,
                            'intent' => $pi['id'],
                            'webhook_amount_laar' => $amount,
                            'currency' => $currency,
                        ]);

                        return;
                    }

                    if ($currency !== self::CURRENCY || (int) $pending->amount_laar !== $amount) {
                        Log::warning('Stripe webhook amount/currency mismatch — ignoring', [
                            'order_id' => $order->id,
                            'intent' => $pi['id'],
                            'webhook_amount_laar' => $amount,
                            'expected_amount_laar' => $pending->amount_laar,
                            'currency' => $currency,
                        ]);

                        return;
                    }

                    $this->finalizeSucceededStripeIntent($pending, $order, $pi);
                });
            }
        }

        return response('OK', 200);
    }

    private function tryReuseStripeIntent(Payment $existing, Order $order): ?JsonResponse
    {
        $intent = $this->stripe->getPaymentIntent((string) $existing->provider_transaction_id);
        $status = (string) ($intent['status'] ?? '');

        if ($status === 'succeeded') {
            $this->finalizeSucceededStripeIntent($existing, $order, $intent);

            return response()->json([
                'payment_intent_id' => $existing->provider_transaction_id,
                'status' => 'succeeded',
                'already_paid' => true,
                'reused' => true,
            ]);
        }

        if (in_array($status, self::REUSABLE_INTENT_STATUSES, true) && !empty($intent['client_secret'])) {
            return response()->json([
                'payment_intent_id' => $existing->provider_transaction_id,
                'client_secret' => $intent['client_secret'],
                'reused' => true,
            ]);
        }

        // canceled / payment_failed / unknown → caller may mint a retry row.
        return null;
    }

    /**
     * @param array<string, mixed> $intent
     */
    private function finalizeSucceededStripeIntent(Payment $payment, Order $order, array $intent): void
    {
        if (in_array((string) $payment->status, ['completed', 'paid', 'confirmed'], true)) {
            return;
        }

        $amount = (int) ($intent['amount'] ?? $payment->amount_laar);
        $payment->update([
            'status' => 'completed',
            'reference_number' => $intent['id'] ?? $payment->provider_transaction_id,
            'processed_at' => now(),
            'amount' => round($amount / 100, 2),
            'amount_laar' => $amount,
            'currency' => strtoupper(self::CURRENCY),
        ]);

        event(new PaymentConfirmed(new PaymentConfirmedData(
            paymentId: $payment->id,
            orderId: $order->id,
            amountLaar: $amount,
            currency: 'mvr',
            orderStatus: $order->status,
        )));
    }
}
