<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Orders\Events\OrderPaid;
use App\Mail\OrderConfirmationMail;
use App\Models\Order;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Sends order confirmation SMS + email after BML payment is received.
 * Only runs for online_pickup and online_delivery orders.
 * POS / cash orders are handled by SendOrderConfirmationListener on OrderCreated.
 */
class SendPaymentConfirmationListener implements ShouldQueue
{
    public bool   $afterCommit = true;
    public string $queue       = 'default';
    public int    $tries       = 3;
    public int    $backoff     = 5;

    private const ONLINE_TYPES = ['online_pickup', 'online_delivery'];

    public function __construct(private SmsService $sms) {}

    public function handle(OrderPaid $event): void
    {
        $data = $event->data;

        // Only handle online orders here; other types were confirmed at creation time.
        if (! in_array($data->orderType, self::ONLINE_TYPES, true)) {
            return;
        }

        $order = Order::with(['items.item', 'customer'])->find($data->orderId);

        if (! $order) {
            return;
        }

        $phone = $order->customer?->phone ?? $order->guest_phone;
        $email = $order->customer?->email ?? $order->guest_email;
        $name  = $order->customer?->name  ?? $order->guest_name ?? 'Customer';

        if (! $phone) {
            return;
        }

        $base = rtrim(config('frontend.order_status_url', config('app.url') . '/order/orders'), '/');
        $url  = $base . '/' . $order->id . '?tok=' . $order->tracking_token;

        // SMS
        try {
            $this->sms->send(new SmsMessage(
                to:             $phone,
                message:        "Bake & Grill: Payment received! Order #{$order->order_number} is confirmed. Track: {$url}",
                type:           'transactional',
                customerId:     $data->customerId,
                referenceType:  'order',
                referenceId:    (string) $order->id,
                idempotencyKey: 'order:paid:confirm:' . $order->id,
            ));
        } catch (\Throwable $e) {
            Log::error('SendPaymentConfirmationListener: SMS failed', [
                'order_id' => $order->id,
                'error'    => $e->getMessage(),
            ]);
        }

        // Email
        if ($email) {
            try {
                Mail::to($email)->send(new OrderConfirmationMail($order, $url, $name));
            } catch (\Throwable $e) {
                Log::error('SendPaymentConfirmationListener: email failed', [
                    'order_id' => $order->id,
                    'error'    => $e->getMessage(),
                ]);
            }
        }
    }
}
