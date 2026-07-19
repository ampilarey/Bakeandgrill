<?php

declare(strict_types=1);

namespace App\Domains\Orders\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Models\Order;
use App\Models\RestaurantTable;
use Illuminate\Support\Facades\Log;

/**
 * Free the dine-in seat once the ticket is paid. Without this, table.status
 * stayed "occupied" after Charge even though no active order remained.
 */
final class ReleaseTableOnOrderPaidListener
{
    public function handle(OrderPaid $event): void
    {
        try {
            $tableId = Order::query()
                ->whereKey($event->data->orderId)
                ->value('restaurant_table_id');

            if ($tableId === null) {
                return;
            }

            // Paid ticket no longer counts as active — release if nothing else sits here.
            RestaurantTable::releaseIfNoActiveOrders((int) $tableId, $event->data->orderId);
        } catch (\Throwable $e) {
            Log::warning('ReleaseTableOnOrderPaidListener failed', [
                'order_id' => $event->data->orderId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
