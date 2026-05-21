<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Listeners;

use App\Domains\Orders\Events\OrderRefunded;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use App\Services\InventoryDeductionService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

/**
 * Reverses recipe-level inventory deductions when an order is refunded.
 *
 * Pairs with DeductInventoryListener which deducts recipe ingredients
 * on OrderPaid. Without this listener, refunds restored prepared/menu-
 * item stock (via RefundController) but raw inventory items
 * (flour, butter, etc.) stayed permanently deducted — inflating COGS
 * and triggering spurious low-stock alerts.
 *
 * Idempotent: InventoryDeductionService::restoreForOrder() guards
 * against double-restore via StockMovement unique idempotency keys
 * and refuses to restore inventory the order never actually deducted
 * (e.g. an online order refunded before payment confirmation).
 */
class RestoreInventoryOnRefundListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public function __construct(
        private OrderRepositoryInterface $orders,
        private InventoryDeductionService $deductionService,
    ) {}

    public function handle(OrderRefunded $event): void
    {
        $order = $this->orders->findWithRelations(
            $event->data->orderId,
            ['items.item.recipe.recipeItems.inventoryItem'],
        );

        if (!$order) {
            Log::error('RestoreInventoryOnRefundListener: order not found', [
                'order_id' => $event->data->orderId,
                'refund_id' => $event->data->refundId,
            ]);

            return;
        }

        try {
            $this->deductionService->restoreForOrder($order);
        } catch (\Throwable $e) {
            Log::error('RestoreInventoryOnRefundListener: restore failed', [
                'order_id' => $event->data->orderId,
                'refund_id' => $event->data->refundId,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
