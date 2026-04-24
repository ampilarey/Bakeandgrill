<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Http\Controllers\Controller;
use App\Http\Requests\ReceiptFeedbackRequest;
use App\Http\Requests\StoreReceiptRequest;
use App\Mail\ReceiptMail;
use App\Models\Order;
use App\Models\Receipt;
use App\Models\ReceiptFeedback;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class ReceiptController extends Controller
{
    private const MAX_RESENDS = 3;

    private const RESEND_COOLDOWN_SECONDS = 120;

    /**
     * Ensure a receipt token exists for the order and return the public URL (for staff "Copy link").
     */
    public function linkForOrder(int $orderId): JsonResponse
    {
        $order = Order::findOrFail($orderId);

        $receipt = Receipt::firstOrNew(['order_id' => $order->id]);
        if (!$receipt->exists) {
            $receipt->token = Str::random(48);
        }
        $receipt->customer_id = $order->customer_id;
        $receipt->save();

        return response()->json([
            'link' => $this->receiptLink($receipt),
        ]);
    }

    public function send(StoreReceiptRequest $request, $orderId)
    {
        $order = Order::with(['items.modifiers', 'payments', 'customer'])
            ->findOrFail($orderId);
        $validated = $request->validated();
        $channel = $validated['channel'] ?? 'email';
        $recipient = $validated['recipient'] ?? null;

        if (!$recipient) {
            $recipient = $channel === 'sms'
                ? $order->customer?->phone
                : $order->customer?->email;
        }

        if (!$recipient) {
            return response()->json(['message' => 'Recipient not available.'], 422);
        }

        $receipt = Receipt::firstOrNew(['order_id' => $order->id]);
        if (!$receipt->exists) {
            $receipt->token = Str::random(48);
        }

        $receipt->fill([
            'customer_id' => $order->customer_id,
            'channel' => $channel,
            'recipient' => $recipient,
        ]);

        $sent = $this->deliverReceipt($receipt);
        if (!$sent) {
            return response()->json(['message' => 'Failed to send receipt.'], 500);
        }

        app(AuditLogService::class)->log(
            'receipt.sent',
            'Receipt',
            $receipt->id,
            [],
            $receipt->toArray(),
            ['order_id' => $order->id],
            $request,
        );

        return response()->json([
            'receipt' => $receipt->fresh(),
            'link' => $this->receiptLink($receipt),
        ], 201);
    }

    public function show($token)
    {
        $receipt = Receipt::with(['order.items.modifiers', 'order.payments', 'feedback'])
            ->where('token', $token)
            ->firstOrFail();

        return response()->json([
            'receipt' => $receipt,
            'order' => $receipt->order,
            'feedback_count' => $receipt->feedback->count(),
        ]);
    }

    public function resend(Request $request, $token)
    {
        $receipt = Receipt::with('order.customer')
            ->where('token', $token)
            ->firstOrFail();

        if ($receipt->resend_count >= self::MAX_RESENDS) {
            return response()->json(['message' => 'Resend limit reached.'], 429);
        }

        if ($receipt->last_sent_at && $receipt->last_sent_at->diffInSeconds(now()) < self::RESEND_COOLDOWN_SECONDS) {
            return response()->json(['message' => 'Please wait before resending.'], 429);
        }

        $sent = $this->deliverReceipt($receipt);
        if (!$sent) {
            return response()->json(['message' => 'Failed to resend receipt.'], 500);
        }

        app(AuditLogService::class)->log(
            'receipt.resent',
            'Receipt',
            $receipt->id,
            [],
            $receipt->toArray(),
            [],
            $request,
        );

        return response()->json([
            'receipt' => $receipt->fresh(),
            'link' => $this->receiptLink($receipt),
        ]);
    }

    public function feedback(ReceiptFeedbackRequest $request, $token)
    {
        $receipt = Receipt::with('order')->where('token', $token)->firstOrFail();

        if (!$this->orderIsPaidForReceipt($receipt->order)) {
            return response()->json(['message' => 'Feedback is available after payment.'], 403);
        }

        $validated = $request->validated();

        $feedback = ReceiptFeedback::create([
            'receipt_id' => $receipt->id,
            'rating' => $validated['rating'],
            'comments' => $validated['comments'] ?? null,
            'submitted_at' => now(),
        ]);

        app(AuditLogService::class)->log(
            'receipt.feedback',
            'Receipt',
            $receipt->id,
            [],
            ['rating' => $feedback->rating],
            [],
            $request,
        );

        return response()->json(['feedback' => $feedback], 201);
    }

    private function deliverReceipt(Receipt $receipt): bool
    {
        $receipt->loadMissing('order.items.modifiers', 'order.payments', 'customer');

        if (!$receipt->recipient) {
            return false;
        }

        if ($receipt->channel === 'sms') {
            $body = $this->smsBodyForReceipt($receipt);
            $log = app(SmsService::class)->send(new SmsMessage(
                to: $receipt->recipient,
                message: $body,
                type: 'transactional',
            ));
            $sent = in_array($log->status, ['sent', 'demo'], true);
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

    private function orderIsPaidForReceipt(?Order $order): bool
    {
        if ($order === null) {
            return false;
        }

        return $order->paid_at !== null
            || in_array($order->status ?? '', ['paid', 'completed', 'delivered', 'refunded'], true);
    }

    private function smsBodyForReceipt(Receipt $receipt): string
    {
        $receipt->loadMissing('order');
        $order = $receipt->order;
        $link = $this->receiptLink($receipt);

        if ($this->orderIsPaidForReceipt($order)) {
            return 'Thanks for visiting Bake & Grill! View your receipt: ' . $link;
        }

        return 'Bake & Grill: Here is your invoice for order #' . ($order->order_number ?? $order->id) . ': ' . $link;
    }
}
