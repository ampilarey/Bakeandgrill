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
        $order->loadMissing('customer');

        $phone = $order->customer?->phone;
        $email = $order->customer?->email;
        $name  = $order->customer?->name ?? 'Customer';

        if (!$phone) {
            return;
        }

        $isOnline = in_array($order->type, self::ONLINE_TYPES, true);

        if ($isOnline) {
            $url     = rtrim(config('frontend.order_status_url', config('app.url') . '/order/orders'), '/') . '/' . $order->id . '?tok=' . $order->tracking_token;
            $message = 'Bake & Grill: Payment received! Order #' . $order->order_number . ' is confirmed. Track: ' . $url;
        } else {
            $receipt = Receipt::firstOrNew(['order_id' => $order->id]);
            if (!$receipt->exists) {
                $receipt->token = Str::random(48);
            }
            $receipt->fill([
                'customer_id'    => $order->customer_id,
                'channel'        => 'sms',
                'recipient'      => $phone,
                'sent_at'        => now(),
                'last_sent_at'   => now(),
                'resend_count'   => ($receipt->resend_count ?? 0) + 1,
            ]);
            $receipt->save();

            $url     = rtrim(config('app.url'), '/') . '/receipts/' . $receipt->token;
            $message = 'Bake & Grill: Thanks for dining with us! Your receipt for order #' . $order->order_number . ': ' . $url;
        }

        try {
            $this->sms->send(new SmsMessage(
                to:             $phone,
                message:        $message,
                type:           'transactional',
                customerId:     $order->customer_id,
                referenceType:  'order',
                referenceId:    (string) $order->id,
                idempotencyKey: 'order:paid:confirm:' . $order->id,
            ));
        } catch (\Throwable $e) {
            Log::error('PaymentConfirmationNotifier: SMS failed', [
                'order_id' => $order->id,
                'error'    => $e->getMessage(),
            ]);
        }

        if ($email) {
            try {
                Mail::to($email)->send(new OrderConfirmationMail($order, $url, $name));
            } catch (\Throwable $e) {
                Log::error('PaymentConfirmationNotifier: email failed', [
                    'order_id' => $order->id,
                    'error'    => $e->getMessage(),
                ]);
            }
        }
    }
}
