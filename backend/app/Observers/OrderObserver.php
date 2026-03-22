<?php

declare(strict_types=1);

namespace App\Observers;

use App\Domains\Notifications\Services\PushNotificationService;
use App\Domains\Realtime\Services\RedisEventPublisher;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Support\Facades\Log;

/**
 * Fires push notifications and Redis pub/sub events when order status changes.
 */
class OrderObserver
{
    public function __construct(
        private PushNotificationService $push,
        private RedisEventPublisher $redis,
    ) {}

    /** Cascade soft-delete to order_items when an order is soft-deleted. */
    public function deleted(Order $order): void
    {
        if ($order->trashed()) {
            OrderItem::where('order_id', $order->id)->delete();
        }
    }

    /** Restore order_items when a soft-deleted order is restored. */
    public function restored(Order $order): void
    {
        OrderItem::withTrashed()->where('order_id', $order->id)->restore();
    }

    public function updated(Order $order): void
    {
        if (! $order->wasChanged('status')) {
            return;
        }

        // Publish Redis event for real-time SSE (when Redis is configured)
        $this->publishRedisEvent($order);

        // Push notification to the customer
        $customerId = $order->customer_id;
        if ($customerId === null) {
            return;
        }

        $status   = $order->status;
        $orderNum = $order->order_number ?? "#{$order->id}";
        $url      = '/order/track/' . $order->id;

        [$title, $body] = $this->resolveMessage($status, $orderNum);

        if ($title === null) {
            return;
        }

        try {
            $this->push->notifyCustomer($customerId, $title, $body, $url);
        } catch (\Throwable $e) {
            Log::warning('OrderObserver: push notification failed', [
                'order_id' => $order->id,
                'error'    => $e->getMessage(),
            ]);
        }
    }

    private function publishRedisEvent(Order $order): void
    {
        $eventType = match ($order->status) {
            'paid'        => 'order.paid',
            'completed'   => 'order.completed',
            'cancelled'   => 'order.cancelled',
            'partial'     => 'order.partial',
            default       => 'order.updated',
        };

        $this->redis->publishOrderEvent($order->id, $eventType, [
            'id'         => $order->id,
            'status'     => $order->status,
            'updated_at' => $order->updated_at?->toIso8601String(),
        ]);
    }

    /**
     * @return array{0: string|null, 1: string}
     */
    private function resolveMessage(string $status, string $orderNum): array
    {
        return match ($status) {
            'paid'        => ['Order Confirmed!', "Order {$orderNum} has been confirmed and is being prepared."],
            'in_progress' => ['Preparing Your Order', "Order {$orderNum} is now being prepared in the kitchen."],
            'ready'       => ['Order Ready!', "Order {$orderNum} is ready for pickup or out for delivery!"],
            'out_for_delivery' => ['Out for Delivery!', "Order {$orderNum} is on its way to you."],
            'completed'   => ['Order Delivered!', "Order {$orderNum} has been completed. Enjoy your meal!"],
            'cancelled'   => ['Order Cancelled', "Order {$orderNum} has been cancelled. Please contact us if you have questions."],
            default       => [null, ''],
        };
    }
}
