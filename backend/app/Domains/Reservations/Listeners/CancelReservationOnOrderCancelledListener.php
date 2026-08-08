<?php

declare(strict_types=1);

namespace App\Domains\Reservations\Listeners;

use App\Domains\Orders\Events\OrderCancelled;
use App\Domains\Orders\Events\OrderRefunded;
use App\Models\Reservation;
use Illuminate\Support\Facades\Log;

/**
 * Prepaid dine-in: a cancelled (or stale, never-paid) order must release
 * its table hold so the seat goes back into the pool. Covers manual
 * cancels and CancelStaleOrders — both dispatch OrderCancelled.
 *
 * Full refunds also release the seat (partial refunds keep the reservation —
 * the guest is still coming).
 */
final class CancelReservationOnOrderCancelledListener
{
    public bool $afterCommit = true;

    public function handle(OrderCancelled|OrderRefunded $event): void
    {
        if ($event instanceof OrderRefunded && $event->data->refundRatio < 1.0) {
            return;
        }

        $orderId = $event->data->orderId;

        try {
            Reservation::query()
                ->where('order_id', $orderId)
                ->whereIn('status', ['pending', 'confirmed'])
                ->update(['status' => 'cancelled']);
        } catch (\Throwable $e) {
            Log::warning('CancelReservationOnOrderCancelledListener failed', [
                'order_id' => $orderId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
