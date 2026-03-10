<?php

declare(strict_types=1);

namespace App\Domains\Printing\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use App\Services\PrintJobService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

/**
 * Dispatches receipt print jobs when an order is fully paid.
 *
 * Runs after DB commit.
 */
class DispatchReceiptPrintListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public int $tries = 3;

    public int $backoff = 5;

    public function __construct(
        private OrderRepositoryInterface $orders,
        private PrintJobService $printJobService,
    ) {}

    public function handle(OrderPaid $event): void
    {
        if (!$event->data->printReceipt) {
            return;
        }

        $order = $this->orders->findWithRelations($event->data->orderId, ['items.modifiers', 'payments']);
        if (!$order) {
            Log::error('DispatchReceiptPrintListener: order not found', ['order_id' => $event->data->orderId]);

            return;
        }

        try {
            $this->printJobService->dispatchReceiptJobs($order);
        } catch (\Throwable $e) {
            Log::error('DispatchReceiptPrintListener: dispatch failed', [
                'order_id' => $event->data->orderId,
                'error'    => $e->getMessage(),
            ]);
        }
    }
}
