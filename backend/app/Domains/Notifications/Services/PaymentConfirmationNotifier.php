<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Services;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Enums\OrderType;
use App\Mail\OrderConfirmationMail;
use App\Models\Order;
use App\Models\Receipt;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Sends a payment confirmation SMS + optional email for a paid order.
 *
 * Called in two ways:
 *   1. Synchronously from PaymentService::confirmPayment / completeZeroBalanceOnlineOrder
 *      (inside DB::afterCommit — fires immediately when payment is confirmed).
 *   2. Queued via SendPaymentConfirmationListener as a retry fallback.
 *
 * The SmsService idempotency key ('order:paid:confirm:{id}') prevents duplicate
 * SMS delivery — whichever path fires first wins; the second is a no-op.
 */
class PaymentConfirmationNotifier
{
    private const ONLINE_TYPES = [
        OrderType::OnlinePickup->value,
        OrderType::Delivery->value,
    ];

    public function __construct(private readonly SmsService $sms) {}

    public function notify(Order $order): void
    {
        $order->loadMissing(['customer', 'payments']);

        $phone = $order->customer?->phone;
        $email = $order->customer?->email;
        $name = $order->customer?->name ?? 'Customer';

        if (!$phone) {
            return;
        }

        $isOnline = in_array($order->type, self::ONLINE_TYPES, true);

        // Ensure a Receipt row exists for every paid order (online: for completion SMS + web receipt; POS: SMS + email).
        $receipt = Receipt::firstOrNew(['order_id' => $order->id]);
        if (!$receipt->exists) {
            $receipt->token = Str::random(48);
        }
        $receipt->customer_id = $order->customer_id;
        if (!$isOnline) {
            $receipt->fill([
                'channel' => 'sms',
                'recipient' => $phone,
                'sent_at' => now(),
                'last_sent_at' => now(),
                'resend_count' => ($receipt->resend_count ?? 0) + 1,
            ]);
        }
        $receipt->save();

        if ($isOnline) {
            // Online pickup / delivery: customer isn't in the room, so
            // surface (a) HOW the payment cleared (BML / cash on
            // pickup / etc) so they have something to reference if
            // anything goes wrong, and (b) a friendly "we'll text you
            // when it's ready" so the cashier doesn't get phone calls
            // asking for updates. The lifecycle SMS will follow at
            // 'ready' (handled by SendCustomerOrderStatusSmsListener).
            $url = rtrim(config('frontend.order_status_url', config('app.url') . '/order/orders'), '/') . '/' . $order->id . '?tok=' . $order->tracking_token;
            $method = $this->paymentMethodLabel($order);
            $readyHint = $order->type === OrderType::Delivery->value
                ? "We'll text you when our rider is on the way."
                : "We'll text you when it's ready for pickup.";
            $message = 'Bake & Grill: Payment received'
                . ($method ? ' via ' . $method : '')
                . '. Order #' . $order->order_number . ' is confirmed. '
                . $readyHint . ' Track: ' . $url;
        } else {
            // POS dine-in / takeaway: customer is at the counter. The
            // receipt link is the only useful SMS — no order-confirmed
            // / preparing / ready noise (those listeners now skip
            // POS types).
            $url = rtrim(config('app.url'), '/') . '/receipts/' . $receipt->token;
            $message = 'Bake & Grill: Thanks for visiting! Receipt for order #' . $order->order_number . ': ' . $url;
        }

        try {
            $this->sms->send(new SmsMessage(
                to: $phone,
                message: $message,
                type: 'transactional',
                customerId: $order->customer_id,
                referenceType: 'order',
                referenceId: (string) $order->id,
                idempotencyKey: 'order:paid:confirm:' . $order->id,
            ));
        } catch (\Throwable $e) {
            Log::error('PaymentConfirmationNotifier: SMS failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);
        }

        if ($email) {
            try {
                Mail::to($email)->send(new OrderConfirmationMail($order, $url, $name));
            } catch (\Throwable $e) {
                Log::error('PaymentConfirmationNotifier: email failed', [
                    'order_id' => $order->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    /**
     * Human-readable label for the payment method(s) used on this
     * order — used in the online payment-received SMS so the
     * customer has a reference if anything goes wrong. Returns
     * null if the order has no confirmed payments yet (caller
     * leaves the "via X" clause out entirely).
     */
    private function paymentMethodLabel(Order $order): ?string
    {
        $methods = $order->payments
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->pluck('method')
            ->filter()
            ->map(fn ($m) => match ((string) $m) {
                'bml_pay', 'bml', 'online' => 'BML Pay',
                'cash'                     => 'cash',
                'card'                     => 'card',
                'gift_card'                => 'gift card',
                'loyalty'                  => 'loyalty points',
                default                    => str_replace('_', ' ', (string) $m),
            })
            ->unique()
            ->values();

        if ($methods->isEmpty()) {
            return null;
        }

        // "BML Pay" or "cash + card" (rare split-tender case)
        return $methods->implode(' + ');
    }
}
