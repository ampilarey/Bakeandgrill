<?php

declare(strict_types=1);

namespace App\Domains\Printing\Listeners;

use App\Domains\Orders\Events\OrderCreated;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use App\Services\PrintJobService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

/**
 * Dispatches kitchen/bar print jobs when an order is created (POS) or paid (online).
 *
 * POS orders  → kitchen print fires on OrderCreated (payment is immediate / concurrent).
 * Online orders → kitchen print is suppressed on OrderCreated (payment not yet confirmed)
 *                and fires here on OrderPaid once BML webhook or zero-balance confirms it.
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

    public function handle(OrderCreated|OrderPaid $event): void
    {
        if ($event instanceof OrderCreated) {
            // POS path: printKitchen=false means the caller suppressed it (e.g. customer online orders).
            if (! $event->data->printKitchen) {
                return;
            }
            $orderId = $event->data->orderId;
        } else {
            // OrderPaid path: only print kitchen for online orders.
            // POS orders were already printed on OrderCreated.
            if (! in_array($event->data->orderType, ['online_pickup', 'delivery'], true)) {
                return;
            }
            $orderId = $event->data->orderId;
        }

        $order = $this->orders->findWithRelations($orderId, ['items.modifiers']);
        if (! $order) {
            Log::error('DispatchKitchenPrintListener: order not found', ['order_id' => $orderId]);

            return;
        }

        try {
            $this->printJobService->dispatchKitchenJobs($order);
        } catch (\Throwable $e) {
            Log::error('DispatchKitchenPrintListener: dispatch failed', [
                'order_id' => $orderId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
