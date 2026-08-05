<?php

declare(strict_types=1);

namespace App\Domains\Reservations\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Reservations\Events\ReservationConfirmed;
use App\Models\Reservation;
use Illuminate\Support\Facades\Log;

/**
 * Prepaid dine-in: payment confirms the table hold automatically —
 * no staff pending→confirmed step, the money already moved.
 * Synchronous after commit so the hold is live even if the queue is down.
 */
final class ConfirmReservationOnOrderPaidListener
{
    public bool $afterCommit = true;

    public function handle(OrderPaid $event): void
    {
        if (($event->data->orderType ?? '') !== 'dine_in') {
            return;
        }

        try {
            $reservation = Reservation::query()
                ->where('order_id', $event->data->orderId)
                ->first();

            if (!$reservation || $reservation->status !== 'pending') {
                return; // already confirmed (idempotent) or no linked booking
            }

            $reservation->update(['status' => 'confirmed']);

            $fresh = $reservation->fresh(['table', 'customer']);
            if ($fresh) {
                ReservationConfirmed::dispatch($fresh);
            }
        } catch (\Throwable $e) {
            Log::warning('ConfirmReservationOnOrderPaidListener failed', [
                'order_id' => $event->data->orderId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
