<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Payments\DTOs\PaymentConfirmedData;
use App\Domains\Payments\Events\PaymentConfirmed;
use App\Domains\Payments\Gateway\StripeService;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class StripeController extends Controller
{
    public function __construct(private StripeService $stripe) {}

    /**
     * Create a PaymentIntent for the given order.
     * Returns client_secret to the frontend to complete payment.
     */
    public function createIntent(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'order_id' => ['required', 'integer', 'exists:orders,id'],
            'currency' => ['sometimes', 'string', 'size:3'],
        ]);

        $order = Order::findOrFail($validated['order_id']);

        // Customer tokens may only pay their own orders.
        // Staff tokens may initiate payment on any order.
        $user = $request->user();
        if ($user?->tokenCan('customer')) {
            if ($order->customer_id !== $user->id) {
                return response()->json(['message' => 'Forbidden.'], 403);
            }
        } elseif (!$user?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $currency = $validated['currency'] ?? 'mvr';
        // StripeService expects laari (smallest unit): 1 MVR = 100 laari.
        // order->total is stored in MVR (decimal), so multiply by 100.
        $amountLaar = (int) round(((float) ($order->total ?? 0)) * 100);
        $result = $this->stripe->createPaymentIntent(
            $amountLaar,
            $currency,
            (string) $order->id,
        );

        return response()->json($result);
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

            if ($orderId) {
                $order = Order::find($orderId);
                if ($order) {
                    // Stripe amounts are in laari (smallest unit). Persist both
                    // columns: amount_laar for integer sums, amount as MVR float
                    // for receipts/legacy readers — same shape as BML/POS rows.
                    $payment = Payment::firstOrCreate(
                        ['idempotency_key' => 'stripe:' . $pi['id']],
                        [
                            'order_id' => $order->id,
                            'method' => 'stripe',
                            'amount' => round($amount / 100, 2),
                            'amount_laar' => $amount,
                            'status' => 'completed',
                            'reference_number' => $pi['id'],
                            'processed_at' => now(),
                        ],
                    );

                    // Only fire the domain event when we actually created a new Payment row.
                    // Duplicate Stripe webhooks carry the same payment_intent ID, so
                    // firstOrCreate returns the existing row without creating — we skip
                    // the event and avoid re-running all downstream listeners.
                    if ($payment->wasRecentlyCreated) {
                        event(new PaymentConfirmed(new PaymentConfirmedData(
                            paymentId: $payment->id,
                            orderId: $order->id,
                            amountLaar: $amount,
                            currency: 'mvr',
                            orderStatus: $order->status,
                        )));
                    }
                }
            }
        }

        return response('OK', 200);
    }
}
