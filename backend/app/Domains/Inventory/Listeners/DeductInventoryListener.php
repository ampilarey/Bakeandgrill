<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use App\Services\InventoryDeductionService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

/**
 * Deducts recipe inventory when an order is fully paid.
 *
 * Queued so POS /payments responses are not blocked on row locks /
 * recipe walks. Idempotent via StockMovement idempotency keys.
 */
class DeductInventoryListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public int $tries = 3;

    public int $backoff = 5;

    public function __construct(
        private OrderRepositoryInterface $orders,
        private InventoryDeductionService $deductionService,
    ) {}

    public function handle(OrderPaid $event): void
    {
        $order = $this->orders->findWithRelations(
            $event->data->orderId,
            ['items.item.recipe.recipeItems.inventoryItem'],
        );

        if (!$order) {
            Log::error('DeductInventoryListener: order not found', ['order_id' => $event->data->orderId]);

            return;
        }

        if (in_array($order->status, ['cancelled', 'refunded', 'partially_refunded'], true)) {
            Log::info('DeductInventoryListener: skipping terminal order', [
                'order_id' => $event->data->orderId,
                'status' => $order->status,
            ]);

            return;
        }

        try {
            $this->deductionService->deductForOrder($order);
        } catch (\Throwable $e) {
            Log::error('DeductInventoryListener: deduction failed', [
                'order_id' => $event->data->orderId,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
