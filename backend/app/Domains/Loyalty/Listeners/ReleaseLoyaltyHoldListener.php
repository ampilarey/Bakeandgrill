<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Listeners;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Orders\Events\OrderCancelled;
use App\Models\LoyaltyHold;
use Illuminate\Support\Facades\Log;

/**
 * Releases active loyalty holds when an order is cancelled.
 *
 * Synchronous after commit so points_held clears even if the queue worker is down.
 */
class ReleaseLoyaltyHoldListener
{
    public bool $afterCommit = true;

    public function __construct(private LoyaltyLedgerService $service) {}

    public function handle(OrderCancelled $event): void
    {
        $orderId = $event->data->orderId;

        $hold = LoyaltyHold::where('order_id', $orderId)
            ->where('status', 'active')
            ->first();

        if (!$hold) {
            return;
        }

        try {
            $this->service->releaseHold($hold);
        } catch (\Throwable $e) {
            Log::error('ReleaseLoyaltyHoldListener: failed to release hold', [
                'hold_id' => $hold->id,
                'order_id' => $orderId,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
