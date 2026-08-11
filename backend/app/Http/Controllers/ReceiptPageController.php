<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Complaints\Services\ComplaintService;
use App\Http\Requests\ReceiptFeedbackRequest;
use App\Models\Order;
use App\Models\Receipt;
use App\Models\ReceiptFeedback;
use Barryvdh\DomPDF\Facade\Pdf;

class ReceiptPageController extends Controller
{
    public function __construct(
        private readonly ComplaintService $complaints,
    ) {}

    public function show($token)
    {
        $receipt = Receipt::with(['order.items.modifiers', 'order.payments', 'order.refunds', 'latestFeedback'])
            ->where('token', $token)
            ->firstOrFail();

        return view('receipt', [
            'receipt' => $receipt,
            'order' => $receipt->order,
            'existingFeedback' => $receipt->latestFeedback,
        ]);
    }

    public function pdf($token)
    {
        $receipt = Receipt::with(['order.items.modifiers', 'order.payments', 'order.refunds'])
            ->where('token', $token)
            ->firstOrFail();

        if (!$this->orderIsPaidForReceipt($receipt->order)) {
            abort(403, 'PDF is available after payment is complete.');
        }

        $pdf = Pdf::loadView('receipt-pdf', [
            'receipt' => $receipt,
            'order' => $receipt->order,
        ]);

        return $pdf->stream('receipt-' . $receipt->order?->order_number . '.pdf');
    }

    public function feedback(ReceiptFeedbackRequest $request, $token)
    {
        $receipt = Receipt::with('order')->where('token', $token)->firstOrFail();

        if (!$this->orderIsPaidForReceipt($receipt->order)) {
            return redirect()->back()->with('error', 'Feedback is available after payment.');
        }

        $validated = $request->validated();
        $feedback = ReceiptFeedback::upsertForReceipt(
            $receipt,
            (int) $validated['rating'],
            $validated['comments'] ?? null,
        );

        // Bridge the previously dead form into the complaint notification path.
        $this->complaints->fromReceiptFeedback($receipt, $feedback);

        return redirect()->back()->with('success', 'Thank you for the feedback.');
    }

    private function orderIsPaidForReceipt(?Order $order): bool
    {
        if ($order === null) {
            return false;
        }

        return $order->paid_at !== null
            || in_array($order->status ?? '', ['paid', 'completed', 'delivered', 'refunded'], true);
    }
}
