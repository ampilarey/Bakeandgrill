<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Orders\Events\OrderPaid;
use App\Mail\OrderConfirmationMail;
use App\Models\Order;
use App\Models\Receipt;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Sends a payment confirmation SMS + optional email after any order is paid.
 *
 * Online orders (online_pickup, online_delivery, delivery):
 *   → tracking link so customer can watch order progress
 *
 * Dine-in / takeaway orders:
 *   → receipt link (customer already left; they want proof of payment)
 *   → also auto-creates a Receipt record for the order
 *
 * Guard: only fires if the order has a customer with a phone number.
 */
class SendPaymentConfirmationListener implements ShouldQueue
{
    public bool $afterCommit = true;
    public string $queue = 'default';
    public int $tries = 3;
    public int $backoff = 5;

    private const ONLINE_TYPES = ['online_pickup', 'online_delivery', 'delivery'];

    public function __construct(private SmsService $sms) {}

    public function handle(OrderPaid $event): void
    {
        $data = $event->data;
        $order = Order::with(['items.item', 'customer'])->find($data->orderId);

        if (!$order) {
            return;
        }

        $phone = $order->customer?->phone;
        $email = $order->customer?->email;
        $name = $order->customer?->name ?? 'Customer';

        // Only send if the order has a customer with a phone number
        if (!$phone) {
            return;
        }

        $isOnline = in_array($order->type, self::ONLINE_TYPES, true);

        if ($isOnline) {
            // Online orders: send tracking link so customer can monitor progress
            $url = rtrim(config('frontend.order_status_url', config('app.url') . '/order/orders'), '/') . '/' . $order->id . '?tok=' . $order->tracking_token;
            $message = 'Bake & Grill: Payment received! Order #' . $order->order_number . ' is confirmed. Track: ' . $url;
        } else {
            // Dine-in / takeaway: auto-create receipt record and send receipt link
            $receipt = Receipt::firstOrNew(['order_id' => $order->id]);
            if (!$receipt->exists) {
                $receipt->token = Str::random(48);
            }
            $receipt->fill([
                'customer_id' => $order->customer_id,
                'channel' => 'sms',
                'recipient' => $phone,
                'sent_at' => now(),
                'last_sent_at' => now(),
                'resend_count' => ($receipt->resend_count ?? 0) + 1,
            ]);
            $receipt->save();

            $receiptLink = rtrim(config('app.url'), '/') . '/receipts/' . $receipt->token;
            $url = $receiptLink;
            $message = 'Bake & Grill: Thanks for dining with us! Your receipt for order #' . $order->order_number . ': ' . $url;
        }

        // SMS
        try {
            $this->sms->send(new SmsMessage(
                to: $phone,
                message: $message,
                type: 'transactional',
                customerId: $data->customerId,
                referenceType: 'order',
                referenceId: (string) $order->id,
                idempotencyKey: 'order:paid:confirm:' . $order->id,
            ));
        } catch (\Throwable $e) {
            Log::error('SendPaymentConfirmationListener: SMS failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);
        }

        // Email (optional)
        if ($email) {
            try {
                Mail::to($email)->send(new OrderConfirmationMail($order, $url, $name));
            } catch (\Throwable $e) {
                Log::error('SendPaymentConfirmationListener: email failed', [
                    'order_id' => $order->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
