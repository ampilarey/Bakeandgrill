<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Payments\Gateway\StripeService;
use App\Domains\Payments\Events\PaymentConfirmed;
use App\Domains\Payments\DTOs\PaymentConfirmedData;
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
        } elseif (! $user?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $currency = $validated['currency'] ?? 'mvr';
        $result = $this->stripe->createPaymentIntent(
            (int) ($order->total ?? 0),
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
        $rawBody   = $request->getContent();

        try {
            $event = $this->stripe->verifyWebhook($rawBody, $sigHeader);
        } catch (\RuntimeException $e) {
            return response($e->getMessage(), 400);
        }

        if ($event['type'] === 'payment_intent.succeeded') {
            $pi       = $event['data']['object'];
            $orderId  = (int) ($pi['metadata']['order_id'] ?? 0);
            $amount   = (int) ($pi['amount'] ?? 0);

            if ($orderId) {
                $order = Order::find($orderId);
                if ($order) {
                    $payment = Payment::firstOrCreate(
                        ['idempotency_key' => 'stripe:' . $pi['id']],
                        [
                            'order_id'     => $order->id,
                            'method'       => 'stripe',
                            'amount'       => $amount,
                            'status'       => 'completed',
                            'reference'    => $pi['id'],
                            'processed_at' => now(),
                        ],
                    );

                    event(new PaymentConfirmed(new PaymentConfirmedData(
                        paymentId:   $payment->id,
                        orderId:     $order->id,
                        amountLaar:  $amount,
                        currency:    'mvr',
                        orderStatus: $order->status,
                    )));
                }
            }
        }

        return response('OK', 200);
    }
}
