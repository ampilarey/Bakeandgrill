<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Repositories\OrderRepositoryInterface;
use App\Services\InventoryDeductionService;
use Illuminate\Support\Facades\Log;

/**
 * Deducts recipe inventory when an order is fully paid.
 *
 * Runs synchronously after the payment transaction commits so raw
 * ingredient stock stays correct even when the queue worker is down.
 * Idempotent via StockMovement idempotency keys.
 */
class DeductInventoryListener
{
    public bool $afterCommit = true;

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

        // Catering: stock is validated/deducted at fire-to-kitchen (Phase 5), not on pay.
        if ($order->type === 'catering') {
            return;
        }

        // Collect-tomorrow: prepared stock waits for fire, and so do the
        // ingredients — taking them on payment day emptied today's pool for
        // tomorrow's order (2026-09-07 audit, finding 5). OrderStatusController
        // deducts both when the ticket is fired.
        if ($order->fulfil_date !== null) {
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
