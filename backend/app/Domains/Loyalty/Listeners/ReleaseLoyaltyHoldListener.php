<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Listeners;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Orders\Events\OrderCancelled;
use App\Models\LoyaltyHold;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

class ReleaseLoyaltyHoldListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public int $tries = 3;

    public int $backoff = 5;

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
                'hold_id'  => $hold->id,
                'order_id' => $orderId,
                'error'    => $e->getMessage(),
            ]);
            // Re-throw so the queue worker retries this job (respects $tries = 3).
            throw $e;
        }
    }
}
