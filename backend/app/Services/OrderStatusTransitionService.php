<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Order;

/**
 * Thin write path for order status changes.
 *
 * Controllers/actions should prefer this over raw `$order->update(['status' => …])`
 * so every transition hits {@see OrderStatusMachine} before persistence.
 * {@see \App\Observers\OrderObserver} remains a second line of defence.
 */
class OrderStatusTransitionService
{
    public function __construct(
        private readonly OrderStatusMachine $machine,
    ) {}

    /**
     * @param array<string, mixed> $extra Additional attributes saved with the status change
     */
    public function transition(Order $order, string $toStatus, array $extra = []): Order
    {
        if ($order->status === $toStatus) {
            if ($extra !== []) {
                $order->update($extra);
            }

            return $order->fresh() ?? $order;
        }

        $this->machine->assertTransitionAllowed($order, $toStatus);
        $order->update(array_merge(['status' => $toStatus], $extra));

        return $order->fresh() ?? $order;
    }
}
