<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Listeners;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Orders\Events\OrderCancelled;
use App\Models\LoyaltyHold;
use Illuminate\Contracts\Queue\ShouldQueue;

class ReleaseLoyaltyHoldListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public function __construct(private LoyaltyLedgerService $service) {}

    public function handle(OrderCancelled $event): void
    {
        $hold = LoyaltyHold::where('order_id', $event->order->id)
            ->where('status', 'active')
            ->first();

        if ($hold) {
            $this->service->releaseHold($hold);
        }
    }
}
