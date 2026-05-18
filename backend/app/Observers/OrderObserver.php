<?php

declare(strict_types=1);

namespace App\Observers;

use App\Domains\Orders\DTOs\OrderStatusChangedData;
use App\Domains\Orders\Events\OrderStatusChanged;
use App\Models\Order;
use App\Models\OrderItem;
use App\Services\OrderStatusMachine;
use Illuminate\Support\Facades\Log;

/**
 * Handles Order model lifecycle hooks.
 *
 * - deleted / restored: cascade soft-delete to order_items (model-layer concern, stays here)
 * - updated: fires OrderStatusChanged event; real-time and push logic live in their own listeners
 */
class OrderObserver
{
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
        if (!$order->wasChanged('status')) {
            return;
        }

        // Defense in depth: log any status change that didn't pass through
        // the state machine. We don't *block* the change here (the observer
        // runs after the model has already been written and abort()ing would
        // corrupt the transaction), but we surface every direct status set
        // that bypassed OrderStatusMachine::assertTransitionAllowed so we can
        // find the offending call site in logs and route it through the
        // machine. The audit found several controllers that updated
        // `status` directly without going through the machine.
        $previous = $order->getOriginal('status');
        if ($previous && $previous !== $order->status) {
            $machine = app(OrderStatusMachine::class);
            if (!$machine->isAllowed($previous, $order->status)) {
                Log::warning('Order status changed outside state machine', [
                    'order_id' => $order->id,
                    'from' => $previous,
                    'to' => $order->status,
                ]);
            }
        }

        OrderStatusChanged::dispatch(new OrderStatusChangedData(
            orderId: $order->id,
            status: $order->status,
            customerId: $order->customer_id,
            orderNumber: $order->order_number ?? "#{$order->id}",
            updatedAt: $order->updated_at?->toIso8601String() ?? now()->toIso8601String(),
        ));
    }
}
