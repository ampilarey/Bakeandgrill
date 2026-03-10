<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Listeners;

use App\Domains\Orders\Events\OrderCancelled;
use App\Models\OrderPromotion;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Releases the draft OrderPromotion when an order is cancelled.
 */
class ReleasePromoReservationListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public function handle(OrderCancelled $event): void
    {
        $orderId = $event->data->orderId;

        try {
            DB::transaction(function () use ($orderId): void {
                OrderPromotion::where('order_id', $orderId)
                    ->where('status', 'draft')
                    ->update(['status' => 'released']);
            });
        } catch (\Throwable $e) {
            Log::error('ReleasePromoReservationListener: failed', [
                'order_id' => $orderId,
                'error'    => $e->getMessage(),
            ]);
        }
    }
}
