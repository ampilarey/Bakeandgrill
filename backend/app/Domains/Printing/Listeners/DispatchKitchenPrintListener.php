<?php

declare(strict_types=1);

namespace App\Domains\Printing\Listeners;

use App\Domains\Orders\Events\OrderCreated;
use App\Services\PrintJobService;
use Illuminate\Contracts\Queue\ShouldQueue;

/**
 * Dispatches kitchen/bar print jobs when an order is created.
 *
 * Runs after DB commit.
 */
class DispatchKitchenPrintListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public function handle(OrderCreated $event): void
    {
        if (!$event->printKitchen) {
            return;
        }

        app(PrintJobService::class)->dispatchKitchenJobs($event->order);
    }
}
