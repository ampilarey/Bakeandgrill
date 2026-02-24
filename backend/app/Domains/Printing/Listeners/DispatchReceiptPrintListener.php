<?php

declare(strict_types=1);

namespace App\Domains\Printing\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Services\PrintJobService;
use Illuminate\Contracts\Queue\ShouldQueue;

/**
 * Dispatches receipt print jobs when an order is fully paid.
 *
 * Runs after DB commit.
 */
class DispatchReceiptPrintListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public function handle(OrderPaid $event): void
    {
        if (!$event->printReceipt) {
            return;
        }

        app(PrintJobService::class)->dispatchReceiptJobs($event->order);
    }
}
