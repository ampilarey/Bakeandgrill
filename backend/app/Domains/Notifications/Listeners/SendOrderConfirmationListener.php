<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Orders\Events\OrderCreated;
use App\Enums\OrderType;
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
     * Types that should NOT receive an "Order confirmed!" SMS at
     * OrderCreated time:
     *  - Online pickup/delivery: payment hasn't happened yet —
     *    PaymentConfirmationNotifier handles those once OrderPaid fires.
     *  - POS dine-in / takeaway: the customer is standing at the
     *    counter. They get the receipt SMS after payment; an extra
     *    "Order confirmed!" SMS is redundant noise and is the source
     *    of the "2 SMS for one ticket" complaint from cashiers.
     */
    private const SKIP_TYPES = [
        OrderType::OnlinePickup->value,  // 'online_pickup'
        OrderType::Delivery->value,      // 'delivery'
        OrderType::DineIn->value,        // 'dine_in'
        OrderType::Takeaway->value,      // 'takeaway'
    ];

    public function handle(OrderCreated $event): void
    {
        $data = $event->data;

        // Skip every type we've explicitly excluded above. In practice
        // this means the listener is a no-op today — kept as a safety
        // net in case a new order type is introduced that genuinely
        // needs an at-creation confirmation.
        if (in_array($data->orderType, self::SKIP_TYPES, true)) {
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
                message: "#{$order->order_number} confirmed. Track: {$url}",
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
