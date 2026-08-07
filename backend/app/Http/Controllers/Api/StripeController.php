<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Payments\DTOs\PaymentConfirmedData;
use App\Domains\Payments\Events\PaymentConfirmed;
use App\Domains\Payments\Gateway\StripeService;
use App\Domains\Payments\Services\PaymentService;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

class StripeController extends Controller
{
    /** Server-fixed currency — never trust a caller-supplied value. */
    private const CURRENCY = 'mvr';

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

        // Customer tokens may only pay their own orders.
        // Staff tokens may initiate payment on any order.
        $user = $request->user();

        return DB::transaction(function () use ($validated, $user): JsonResponse {
            $order = Order::lockForUpdate()->findOrFail($validated['order_id']);

            if ($user?->tokenCan('customer')) {
                if ($order->customer_id !== $user->id) {
                    return response()->json(['message' => 'Forbidden.'], 403);
                }
            } elseif (!$user?->tokenCan('staff')) {
                return response()->json(['message' => 'Forbidden.'], 403);
            }

            // Terminal / non-payable orders take no new intent.
            if (in_array($order->status, ['cancelled', 'refunded', 'completed'], true)
                || $order->payment_status === 'paid') {
                abort(422, 'This order is not awaiting payment.');
            }

            // 2026-08 audit #6: charge only the canonical remaining balance,
            // never the raw order total (which would over-charge a partially
            // paid order and re-charge a paid one).
            $amountLaar = $this->payments->getRemainingBalanceLaar($order);
            if ($amountLaar <= 0) {
                abort(422, 'This order is already fully paid.');
            }

            // Reuse a pending Stripe intent for this order + amount so repeated
            // taps do not mint duplicate full-order charges. The client_secret
            // is a secret and is never persisted — re-fetch it from Stripe.
            $idempotencyKey = 'stripe:intent:' . $order->id . ':' . $amountLaar;
            $existing = Payment::where('idempotency_key', $idempotencyKey)
                ->where('status', 'pending')
                ->first();
            if ($existing && $existing->provider_transaction_id) {
                $intent = $this->stripe->getPaymentIntent($existing->provider_transaction_id);
                $reusableStates = ['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'];
                if (in_array($intent['status'] ?? '', $reusableStates, true) && !empty($intent['client_secret'])) {
                    return response()->json([
                        'payment_intent_id' => $existing->provider_transaction_id,
                        'client_secret' => $intent['client_secret'],
                        'reused' => true,
                    ]);
                }
            }

            $result = $this->stripe->createPaymentIntent(
                $amountLaar,
                self::CURRENCY,
                (string) $order->id,
            );

            Payment::updateOrCreate(
                ['idempotency_key' => $idempotencyKey],
                [
                    'order_id' => $order->id,
                    'method' => 'stripe',
                    'gateway' => 'stripe',
                    'currency' => strtoupper(self::CURRENCY),
                    'amount' => round($amountLaar / 100, 2),
                    'amount_laar' => $amountLaar,
                    'provider_transaction_id' => $result['payment_intent_id'] ?? null,
                    'status' => 'pending',
                    'processed_at' => now(),
                ],
            );

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
                $order = Order::find($orderId);
                if ($order) {
                    // Terra residual / pre-Stripe-live hardening: only complete
                    // intents we previously created locally. Never mint a
                    // completed payment from a webhook alone.
                    $pending = Payment::where('provider_transaction_id', $pi['id'])
                        ->where('order_id', $order->id)
                        ->where('gateway', 'stripe')
                        ->first();

                    if (!$pending) {
                        \Illuminate\Support\Facades\Log::warning('Stripe webhook: no matching local pending intent — ignoring', [
                            'order_id' => $order->id,
                            'intent' => $pi['id'],
                            'webhook_amount_laar' => $amount,
                            'currency' => $currency,
                        ]);

                        return response('OK', 200);
                    }

                    if ($currency !== self::CURRENCY || (int) $pending->amount_laar !== $amount) {
                        \Illuminate\Support\Facades\Log::warning('Stripe webhook amount/currency mismatch — ignoring', [
                            'order_id' => $order->id,
                            'intent' => $pi['id'],
                            'webhook_amount_laar' => $amount,
                            'expected_amount_laar' => $pending->amount_laar,
                            'currency' => $currency,
                        ]);

                        return response('OK', 200);
                    }

                    // Already completed (duplicate delivery) — acknowledge, no re-event.
                    if (in_array((string) $pending->status, ['completed', 'paid', 'confirmed'], true)) {
                        return response('OK', 200);
                    }

                    $pending->update([
                        'status' => 'completed',
                        'reference_number' => $pi['id'],
                        'processed_at' => now(),
                        'amount' => round($amount / 100, 2),
                        'amount_laar' => $amount,
                        'currency' => strtoupper(self::CURRENCY),
                    ]);

                    event(new PaymentConfirmed(new PaymentConfirmedData(
                        paymentId: $pending->id,
                        orderId: $order->id,
                        amountLaar: $amount,
                        currency: 'mvr',
                        orderStatus: $order->status,
                    )));
                }
            }
        }

        return response('OK', 200);
    }
}
