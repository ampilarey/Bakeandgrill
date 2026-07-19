<?php

declare(strict_types=1);

namespace App\Domains\Orders\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Models\Order;
use App\Models\RestaurantTable;
use Illuminate\Support\Facades\Log;

/**
 * Free the dine-in seat once the ticket is paid.
 * Clears restaurant_table_id so "linked" always means an open check.
 */
final class ReleaseTableOnOrderPaidListener
{
    public function handle(OrderPaid $event): void
    {
        try {
            $order = Order::query()->find($event->data->orderId);
            if ($order === null || $order->restaurant_table_id === null) {
                return;
            }

            $tableId = (int) $order->restaurant_table_id;
            $order->update(['restaurant_table_id' => null]);
            RestaurantTable::syncOccupancy($tableId);
        } catch (\Throwable $e) {
            Log::warning('ReleaseTableOnOrderPaidListener failed', [
                'order_id' => $event->data->orderId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
