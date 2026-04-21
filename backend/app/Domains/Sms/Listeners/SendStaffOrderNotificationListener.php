<?php

declare(strict_types=1);

namespace App\Domains\Sms\Listeners;

use App\Domains\Orders\Events\OrderCreated;
use App\Domains\Orders\Events\OrderStatusChanged;
use App\Domains\Sms\Services\StaffNotificationDispatcher;
use App\Models\Order;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

class SendStaffOrderNotificationListener implements ShouldQueue
{
    public string $queue = 'default';

    public int $tries = 3;

    public function __construct(
        private readonly StaffNotificationDispatcher $dispatcher,
    ) {}

    /**
     * Handles both OrderCreated and OrderStatusChanged events.
     * Converts the event into a staff notification event type string and dispatches.
     */
    public function handle(OrderCreated|OrderStatusChanged $event): void
    {
        if ($event instanceof OrderCreated) {
            $this->handleOrderCreated($event);
        } else {
            $this->handleOrderStatusChanged($event);
        }
    }

    private function handleOrderCreated(OrderCreated $event): void
    {
        $order = Order::with('items.item')->find($event->data->orderId);

        if (! $order) {
            return;
        }

        // Online orders (online_pickup, delivery) require payment before staff is notified.
        // Skip here — the 'order_confirmed' event fires once payment goes through.
        if (in_array($order->type, ['online_pickup', 'delivery'], true)
            && in_array($order->status, ['draft', 'payment_pending'], true)
        ) {
            return;
        }

        $this->dispatcher->dispatch($order, 'new_order');
    }

    private function handleOrderStatusChanged(OrderStatusChanged $event): void
    {
        $order = Order::with('items.item')->find($event->data->orderId);

        if (! $order) {
            return;
        }

        $eventType = $this->mapStatusToEventType($event->data->status, $order);

        if (! $eventType) {
            return;
        }

        $this->dispatcher->dispatch($order, $eventType);
    }

    /**
     * Map order statuses to staff notification event types.
     * Returns null for statuses that don't trigger staff notifications.
     *
     * 'pending' only fires for online_pickup/delivery orders — it means payment
     * just completed and the order is now waiting for kitchen action.
     * Takeaway/dine-in orders are notified on OrderCreated, not here.
     */
    private function mapStatusToEventType(string $status, Order $order): ?string
    {
        return match ($status) {
            'pending'             => in_array($order->type, ['online_pickup', 'delivery'], true)
                                        ? 'new_order'
                                        : null,
            'in_progress', 'paid' => 'order_confirmed',
            'ready'               => 'order_ready',
            'on_the_way'          => 'order_out_for_delivery',
            default               => null,
        };
    }
}
