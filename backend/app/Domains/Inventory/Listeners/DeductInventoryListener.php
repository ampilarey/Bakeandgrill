<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use App\Services\InventoryDeductionService;
use Illuminate\Support\Facades\Log;

/**
 * Deducts inventory for an order when fully paid.
 *
 * Runs synchronously (not queued) — stock must be deducted before the
 * payment response is returned so counts stay accurate in real time.
 * Idempotent: InventoryDeductionService checks for existing StockMovements.
 */
class DeductInventoryListener
{
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

        if (! $order) {
            Log::error('DeductInventoryListener: order not found', ['order_id' => $event->data->orderId]);

            return;
        }

        try {
            $this->deductionService->deductForOrder($order);
        } catch (\Throwable $e) {
            Log::error('DeductInventoryListener: deduction failed', [
                'order_id' => $event->data->orderId,
                'error' => $e->getMessage(),
            ]);
            // Re-throw so any outer transaction rolls back — failure here is non-silent.
            throw $e;
        }
    }
}
