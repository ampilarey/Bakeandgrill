<?php

declare(strict_types=1);

namespace App\Domains\Reservations\Listeners;

use App\Domains\Orders\Events\OrderCancelled;
use App\Models\Reservation;
use Illuminate\Support\Facades\Log;

/**
 * Prepaid dine-in: a cancelled (or stale, never-paid) order must release
 * its table hold so the seat goes back into the pool. Covers manual
 * cancels and CancelStaleOrders — both dispatch OrderCancelled.
 */
final class CancelReservationOnOrderCancelledListener
{
    public bool $afterCommit = true;

    public function handle(OrderCancelled $event): void
    {
        try {
            Reservation::query()
                ->where('order_id', $event->data->orderId)
                ->whereIn('status', ['pending', 'confirmed'])
                ->update(['status' => 'cancelled']);
        } catch (\Throwable $e) {
            Log::warning('CancelReservationOnOrderCancelledListener failed', [
                'order_id' => $event->data->orderId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
