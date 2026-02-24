<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Listeners;

use App\Domains\Orders\Events\OrderCancelled;
use App\Models\OrderPromotion;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\DB;

/**
 * Releases the draft OrderPromotion when an order is cancelled.
 */
class ReleasePromoReservationListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public function handle(OrderCancelled $event): void
    {
        DB::transaction(function () use ($event): void {
            OrderPromotion::where('order_id', $event->order->id)
                ->where('status', 'draft')
                ->update(['status' => 'released']);
        });
    }
}
