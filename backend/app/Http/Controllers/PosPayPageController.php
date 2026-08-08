<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Payments\Services\PaymentService;
use App\Models\Receipt;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\View\View;

/**
 * Public POS pay page — customer sees order details, agrees to terms,
 * then is redirected to BML. Separate from the online order React app.
 */
class PosPayPageController extends Controller
{
    public function show(string $token): View|RedirectResponse
    {
        $receipt = Receipt::with(['order.items.modifiers', 'order.payments'])
            ->where('token', $token)
            ->firstOrFail();

        $order = $receipt->order;
        if ($order === null) {
            abort(404);
        }

        if ($this->orderIsFullyPaid($order)) {
            return redirect()
                ->route('receipts.show', $receipt->token)
                ->with('success', 'This order is already paid.');
        }

        $paymentService = app(PaymentService::class);
        $remainingLaar = $paymentService->getRemainingBalanceLaar($order);

        if ($remainingLaar <= 0) {
            return redirect()
                ->route('receipts.show', $receipt->token)
                ->with('success', 'Nothing left to pay on this order.');
        }

        return view('pos-pay', [
            'receipt' => $receipt,
            'order' => $order,
            'amountDueLaar' => $remainingLaar,
            'amountDue' => round($remainingLaar / 100, 2),
        ]);
    }

    public function pay(Request $request, string $token): RedirectResponse
    {
        $request->validate([
            'accept_terms' => ['accepted'],
        ]);

        $receipt = Receipt::with(['order.items.modifiers', 'order.payments'])
            ->where('token', $token)
            ->firstOrFail();

        $order = $receipt->order;
        if ($order === null) {
            abort(404);
        }

        if ($this->orderIsFullyPaid($order)) {
            return redirect()
                ->route('receipts.show', $receipt->token)
                ->with('success', 'This order is already paid.');
        }

        $paymentService = app(PaymentService::class);
        $remainingLaar = $paymentService->getRemainingBalanceLaar($order);

        if ($remainingLaar <= 0) {
            return redirect()
                ->route('receipts.show', $receipt->token)
                ->with('success', 'Nothing left to pay on this order.');
        }

        // Stable per order+remaining balance so retries reuse the same BML session
        // (PaymentService also guards active sessions server-side).
        $idempotencyKey = 'paypage:' . $order->id . ':' . $remainingLaar;
        $returnUrl = rtrim((string) config('bml.return_url'), '/')
            . '?orderId=' . $order->id
            . '&receiptToken=' . urlencode($receipt->token);

        try {
            $session = $paymentService->initiatePartialBmlPayment(
                $order,
                $remainingLaar,
                $idempotencyKey,
                $returnUrl,
            );
        } catch (\Throwable $e) {
            Log::error('pos-pay: BML initiate failed', [
                'order_id' => $order->id,
                'receipt_token' => $token,
                'error' => $e->getMessage(),
            ]);

            return redirect()
                ->route('pos-pay.show', $receipt->token)
                ->with('error', 'Could not start payment right now. Please try again or pay at the counter.');
        }

        $paymentUrl = $session['payment_url'] ?? null;
        if (!$paymentUrl) {
            return redirect()
                ->route('pos-pay.show', $receipt->token)
                ->with('error', 'Payment gateway did not return a URL. Please try again.');
        }

        return redirect()->away($paymentUrl);
    }

    private function orderIsFullyPaid($order): bool
    {
        return $order->paid_at !== null
            || ($order->payment_status ?? '') === 'paid'
            || in_array($order->status ?? '', ['paid', 'completed', 'delivered', 'refunded'], true);
    }
}
