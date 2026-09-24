<?php

declare(strict_types=1);

namespace App\Observers;

use App\Domains\Orders\DTOs\OrderStatusChangedData;
use App\Domains\Orders\Events\OrderStatusChanged;
use App\Models\Order;
use App\Models\OrderItem;
use App\Services\OrderStatusMachine;
use App\Support\DeferAfterResponse;
use Illuminate\Support\Facades\DB;
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

    public function updating(Order $order): bool
    {
        if (!$order->isDirty('status')) {
            return true;
        }

        $previous = $order->getOriginal('status');
        $next = $order->status;

        if (!$previous || $previous === $next) {
            return true;
        }

        $machine = app(OrderStatusMachine::class);
        if (!$machine->isAllowed($previous, $next)) {
            Log::warning('Order status transition blocked by state machine', [
                'order_id' => $order->id,
                'from' => $previous,
                'to' => $next,
            ]);

            return false;
        }

        // Kitchen audit, 2026-09-26: the status is also rewritten by payment
        // (a cooking ticket paid at the till reads `paid`), so the kitchen's
        // own facts are stamped once, here, where every transition passes.
        if ($next === 'in_progress' && $order->kitchen_started_at === null) {
            $order->kitchen_started_at = now();
        }
        if ($next === 'ready' && $order->ready_at === null) {
            $order->ready_at = now();
        }
        // Every path to cancelled, not only the customer and payment ones,
        // so the kitchen screen can show a cancelled ticket for a moment.
        if ($next === 'cancelled' && $order->cancelled_at === null) {
            $order->cancelled_at = now();
        }

        return true;
    }

    public function updated(Order $order): void
    {
        if (!$order->wasChanged('status')) {
            return;
        }

        // Log direct sets that bypass assertTransitionAllowed() in controllers
        // (updating() above already blocked invalid transitions).
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

        // Kitchen audit, 2026-09-26: a cancelled order the kitchen already
        // had prints a CANCELLED slip. It used to vanish from the screen and
        // nothing printed, so a cook could finish it.
        if ($order->status === 'cancelled' && $previous !== 'cancelled') {
            $orderId = (int) $order->id;
            DB::afterCommit(static function () use ($orderId): void {
                try {
                    $fresh = Order::find($orderId);
                    if ($fresh !== null) {
                        app(\App\Domains\Printing\Services\PrintJobService::class)->enqueueKitchenCancelled($fresh);
                    }
                } catch (\Throwable $e) {
                    Log::warning('Kitchen cancel slip failed', ['order_id' => $orderId, 'error' => $e->getMessage()]);
                }
            });
        }

        $data = new OrderStatusChangedData(
            orderId: $order->id,
            status: $order->status,
            customerId: $order->customer_id,
            orderNumber: $order->order_number ?? "#{$order->id}",
            updatedAt: $order->updated_at?->toIso8601String() ?? now()->toIso8601String(),
        );

        // POS payment flips status → paid inside addPayments. Dispatching
        // OrderStatusChanged synchronously here forced Laravel to push
        // several queued listeners to Redis before the JSON response
        // left PHP — slow when Redis is reachable, 500 when it is not.
        DeferAfterResponse::run(
            static fn () => OrderStatusChanged::dispatch($data),
            'OrderStatusChanged',
        );
    }
}
