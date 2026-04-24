<?php

declare(strict_types=1);

namespace App\Domains\Orders\Listeners;

use App\Domains\Orders\Events\OrderCancelled;
use App\Services\StockReservationService;
use Illuminate\Support\Facades\Log;

/**
 * Releases any active stock reservations when an order is cancelled.
 *
 * Idempotent: releaseForOrder() is a safe no-op when no reservation exists.
 * Handles: stale-payment cancellations, payment failure, manual cancellation.
 */
class ReleasePreparedStockOnCancelListener
{
    public function __construct(
        private readonly StockReservationService $reservationService,
    ) {}

    public function handle(OrderCancelled $event): void
    {
        try {
            $this->reservationService->releaseForOrder($event->data->orderId);
        } catch (\Throwable $e) {
            Log::error('ReleasePreparedStockOnCancelListener: release failed', [
                'order_id' => $event->data->orderId,
                'error' => $e->getMessage(),
            ]);
            // Do not re-throw — a release failure must not block other cancel listeners
        }
    }
}
