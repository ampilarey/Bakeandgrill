<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Services\InventoryDeductionService;
use Illuminate\Contracts\Queue\ShouldQueue;

/**
 * Deducts inventory for an order when fully paid.
 *
 * Runs after DB commit so the order is guaranteed to be visible.
 * Idempotent: InventoryDeductionService checks for existing StockMovements.
 */
class DeductInventoryListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public function handle(OrderPaid $event): void
    {
        app(InventoryDeductionService::class)->deductForOrder($event->order);
    }
}
