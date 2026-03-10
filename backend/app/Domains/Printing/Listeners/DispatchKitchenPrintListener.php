<?php

declare(strict_types=1);

namespace App\Domains\Printing\Listeners;

use App\Domains\Orders\Events\OrderCreated;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use App\Services\PrintJobService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

/**
 * Dispatches kitchen/bar print jobs when an order is created.
 *
 * Runs after DB commit.
 */
class DispatchKitchenPrintListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public int $tries = 3;

    public int $backoff = 5;

    public function __construct(
        private OrderRepositoryInterface $orders,
        private PrintJobService $printJobService,
    ) {}

    public function handle(OrderCreated $event): void
    {
        if (!$event->data->printKitchen) {
            return;
        }

        $order = $this->orders->findWithRelations($event->data->orderId, ['items.modifiers']);
        if (!$order) {
            Log::error('DispatchKitchenPrintListener: order not found', ['order_id' => $event->data->orderId]);

            return;
        }

        try {
            $this->printJobService->dispatchKitchenJobs($order);
        } catch (\Throwable $e) {
            Log::error('DispatchKitchenPrintListener: dispatch failed', [
                'order_id' => $event->data->orderId,
                'error'    => $e->getMessage(),
            ]);
        }
    }
}
