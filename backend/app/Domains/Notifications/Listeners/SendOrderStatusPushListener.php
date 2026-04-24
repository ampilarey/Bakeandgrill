<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Listeners;

use App\Domains\Notifications\Services\PushNotificationService;
use App\Domains\Orders\Events\OrderStatusChanged;
use Illuminate\Support\Facades\Log;

/**
 * Sends a Web Push notification to the customer when their order status changes.
 * Extracted from OrderObserver so the notification concern is self-contained here.
 */
class SendOrderStatusPushListener
{
    public function __construct(private readonly PushNotificationService $push) {}

    public function handle(OrderStatusChanged $event): void
    {
        $data = $event->data;

        if ($data->customerId === null) {
            return;
        }

        [$title, $body] = $this->resolveMessage($data->status, $data->orderNumber);

        if ($title === null) {
            return;
        }

        try {
            $this->push->notifyCustomer(
                $data->customerId,
                $title,
                $body,
                '/orders/'.$data->orderId,
            );
        } catch (\Throwable $e) {
            Log::warning('SendOrderStatusPushListener: push notification failed', [
                'order_id' => $data->orderId,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /** @return array{0: string|null, 1: string} */
    private function resolveMessage(string $status, string $orderNum): array
    {
        return match ($status) {
            'paid' => ['Order Confirmed!',     "Order {$orderNum} has been confirmed and is being prepared."],
            'in_progress' => ['Preparing Your Order', "Order {$orderNum} is now being prepared in the kitchen."],
            'ready' => ['Order Ready!',         "Order {$orderNum} is ready for pickup or out for delivery!"],
            'out_for_delivery' => ['Out for Delivery!',    "Order {$orderNum} is on its way to you."],
            'completed' => ['Order Delivered!',     "Order {$orderNum} has been completed. Enjoy your meal!"],
            'cancelled' => ['Order Cancelled',      "Order {$orderNum} has been cancelled. Please contact us if you have questions."],
            default => [null, ''],
        };
    }
}
