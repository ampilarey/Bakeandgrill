<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Orders\Events\OrderCreated;
use App\Mail\OrderConfirmationMail;
use App\Models\Order;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendOrderConfirmationListener implements ShouldQueue
{
    public bool $afterCommit = true;
    public string $queue = 'default';
    public int $tries = 3;
    public int $backoff = 5;

    public function __construct(private SmsService $sms) {}

    /**
     * Online orders require BML payment before confirmation — handled by SendPaymentConfirmationListener.
     */
    private const DEFERRED_TYPES = ['online_pickup', 'online_delivery'];

    public function handle(OrderCreated $event): void
    {
        $data = $event->data;

        // Skip online orders — payment has not happened yet at order creation time.
        // SendPaymentConfirmationListener will send confirmation once OrderPaid fires.
        if (in_array($data->orderType, self::DEFERRED_TYPES, true)) {
            return;
        }

        $order = Order::with(['items.item', 'customer'])->find($data->orderId);

        if (!$order) {
            return;
        }

        $phone = $order->customer?->phone;
        $email = $order->customer?->email;
        $name = $order->customer?->name ?? 'Customer';

        // Orders with no linked customer phone — skip
        if (!$phone) {
            return;
        }

        $url = rtrim(config('app.url'), '/') . '/order/orders/' . $order->id . '?tok=' . $order->tracking_token;

        // SMS — idempotency key prevents duplicate sends on queue retry
        try {
            $this->sms->send(new SmsMessage(
                to: $phone,
                message: "Bake & Grill: Order #{$order->order_number} confirmed! Track your order: {$url}",
                type: 'transactional',
                customerId: $data->customerId,
                referenceType: 'order',
                referenceId: (string) $order->id,
                idempotencyKey: 'order:confirm:' . $order->id,
            ));
        } catch (\Throwable $e) {
            Log::error('SendOrderConfirmationListener: SMS failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);
        }

        // Email — optional, failure does not affect SMS
        if ($email) {
            try {
                Mail::to($email)->send(new OrderConfirmationMail($order, $url, $name));
            } catch (\Throwable $e) {
                Log::error('SendOrderConfirmationListener: email failed', [
                    'order_id' => $order->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
