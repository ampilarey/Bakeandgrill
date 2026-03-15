<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Payments\Services\PaymentService;
use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function __construct(private PaymentService $paymentService) {}

    /**
     * Initiate a BML online payment for a customer order.
     * Returns the BML payment URL for redirect.
     */
    public function initiateOnline(Request $request, int $orderId): JsonResponse
    {
        $order = Order::findOrFail($orderId);

        if (!$request->user()->tokenCan('customer')) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        if ($order->customer_id !== $request->user()->id) {
            return response()->json(['message' => 'Not your order'], 403);
        }

        if (in_array($order->status, ['paid', 'completed'], true)) {
            return response()->json(['message' => 'Order already paid'], 422);
        }

        $result = $this->paymentService->initiateBmlPayment($order);

        // Hold the order in payment_pending until BML webhook confirms.
        // Kitchen (KDS/admin) should not see it until payment is confirmed.
        if (!in_array($order->status, ['payment_pending', 'paid', 'completed'], true)) {
            $order->update(['status' => 'payment_pending']);
        }

        return response()->json([
            'payment_url' => $result['payment_url'],
            'payment_id' => $result['payment_id'],
        ]);
    }

    /**
     * POST /api/payments/online/initiate-partial
     *
     * Initiate a partial BML online payment.
     * Existing endpoint (initiateOnline) remains unchanged.
     *
     * Body:
     *   order_id        int (required)
     *   amount          int laari (required, > 0, <= remaining balance)
     *   idempotency_key string (required; allows safe retry)
     */
    public function initiatePartial(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'order_id' => 'required|integer|exists:orders,id',
            'amount' => 'required|integer|min:1',
            'idempotency_key' => 'required|string|max:100',
        ]);

        $order = Order::findOrFail($validated['order_id']);

        if (!$request->user()->tokenCan('customer')) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        if ($order->customer_id !== $request->user()->id) {
            return response()->json(['message' => 'Not your order'], 403);
        }

        if (in_array($order->status, ['paid', 'completed'], true)) {
            return response()->json(['message' => 'Order already paid'], 422);
        }

        try {
            $result = $this->paymentService->initiatePartialBmlPayment(
                $order,
                (int) $validated['amount'],
                $validated['idempotency_key'],
            );
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'payment_url' => $result['payment_url'],
            'payment_id' => $result['payment_id'],
            'amount_laar' => $result['amount_laar'],
            'remaining_balance_before_laar' => $result['remaining_balance_before_laar'],
            'remaining_balance_after_laar' => $result['remaining_balance_after_laar'],
            'reused' => $result['reused'],
        ]);
    }

    /**
     * BML return URL handler (non-authoritative).
     * Always redirects to the order status page.
     * Payment status is only confirmed via webhook.
     */
    public function bmlReturn(Request $request): \Illuminate\Http\RedirectResponse
    {
        $orderId = $request->query('orderId');
        $state = $request->query('state', 'UNKNOWN');

        return redirect(
            config('frontend.order_status_url') . '/' . $orderId . '?payment=' . $state,
        );
    }
}
