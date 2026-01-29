<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReceiptFeedbackRequest;
use App\Mail\ReceiptMail;
use App\Models\Receipt;
use App\Models\ReceiptFeedback;
use App\Services\SmsService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

class ReceiptPageController extends Controller
{
    private const MAX_RESENDS = 3;
    private const RESEND_COOLDOWN_SECONDS = 120;

    public function show($token)
    {
        $receipt = Receipt::with(['order.items.modifiers', 'order.payments'])
            ->where('token', $token)
            ->firstOrFail();

        return view('receipt', [
            'receipt' => $receipt,
            'order' => $receipt->order,
        ]);
    }

    public function pdf($token)
    {
        $receipt = Receipt::with(['order.items.modifiers', 'order.payments'])
            ->where('token', $token)
            ->firstOrFail();

        $pdf = Pdf::loadView('receipt-pdf', [
            'receipt' => $receipt,
            'order' => $receipt->order,
        ]);

        return $pdf->stream('receipt-' . $receipt->order?->order_number . '.pdf');
    }

    public function resend(Request $request, $token)
    {
        $receipt = Receipt::with('order.customer')
            ->where('token', $token)
            ->firstOrFail();

        if ($receipt->resend_count >= self::MAX_RESENDS) {
            return redirect()->back()->with('error', 'Resend limit reached.');
        }

        if ($receipt->last_sent_at && $receipt->last_sent_at->diffInSeconds(now()) < self::RESEND_COOLDOWN_SECONDS) {
            return redirect()->back()->with('error', 'Please wait before resending.');
        }

        $sent = $this->deliverReceipt($receipt);
        if (!$sent) {
            return redirect()->back()->with('error', 'Failed to resend receipt.');
        }

        return redirect()->back()->with('success', 'Receipt resent.');
    }

    public function feedback(ReceiptFeedbackRequest $request, $token)
    {
        $receipt = Receipt::where('token', $token)->firstOrFail();

        ReceiptFeedback::create([
            'receipt_id' => $receipt->id,
            'rating' => $request->validated()['rating'],
            'comments' => $request->validated()['comments'] ?? null,
            'submitted_at' => now(),
        ]);

        return redirect()->back()->with('success', 'Thank you for the feedback.');
    }

    private function deliverReceipt(Receipt $receipt): bool
    {
        $receipt->loadMissing('order.items.modifiers', 'order.payments', 'customer');

        if (!$receipt->recipient) {
            return false;
        }

        if ($receipt->channel === 'sms') {
            $message = 'Thanks for visiting Bake & Grill! View your receipt: ' . $this->receiptLink($receipt);
            $sent = app(SmsService::class)->send($receipt->recipient, $message);
        } else {
            Mail::to($receipt->recipient)->send(new ReceiptMail($receipt));
            $sent = true;
        }

        if ($sent) {
            $receipt->sent_at = now();
            $receipt->last_sent_at = now();
            $receipt->resend_count = $receipt->resend_count + 1;
            $receipt->save();
        }

        return $sent;
    }

    private function receiptLink(Receipt $receipt): string
    {
        return rtrim(config('app.url'), '/') . '/receipts/' . $receipt->token;
    }
}
