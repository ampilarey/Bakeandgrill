<?php

declare(strict_types=1);

namespace App\Domains\Printing\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use App\Services\PrintJobService;
use Illuminate\Support\Facades\Log;

/**
 * Dispatches receipt print jobs when an order is fully paid.
 * Synchronous after commit so receipts enqueue even if the queue worker is down.
 */
class DispatchReceiptPrintListener
{
    public bool $afterCommit = true;

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

        if ($order->type === 'gift_card') {
            return;
        }

        try {
            $this->printJobService->dispatchReceiptJobs($order);
        } catch (\Throwable $e) {
            Log::error('DispatchReceiptPrintListener: dispatch failed', [
                'order_id' => $event->data->orderId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
