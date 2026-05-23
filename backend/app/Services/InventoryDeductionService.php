<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Inventory\DTOs\StockLevelChangedData;
use App\Domains\Inventory\Events\StockLevelChanged;
use App\Models\Order;
use App\Models\StockMovement;
use Illuminate\Support\Facades\DB;

class InventoryDeductionService
{
    /**
     * Reverse a previous deductForOrder() — restores recipe-level
     * inventory when an order is refunded. Idempotent: uses a
     * distinct 'refund:' prefix on the StockMovement idempotency
     * key so a double-refund call can't double-restore raw
     * ingredients, AND a refund following a never-deducted order
     * (online order paid → refunded before kitchen prep) is a
     * safe no-op because the matching 'order:…' deduction movement
     * is absent.
     *
     * Without this, refunds restored menu-item stock (in RefundController)
     * but left raw recipe ingredients permanently decremented —
     * COGS reports inflated, low-stock alerts fired earlier than they
     * should, and the cashier had no way to put the flour/butter/oil
     * back on the shelf for a refunded ticket.
     */
    public function restoreForOrder(Order $order, ?int $userId = null, float $ratio = 1.0, ?int $refundId = null): void
    {
        $ratio = max(0.0, min(1.0, $ratio));
        if ($ratio <= 0) {
            return;
        }

        DB::transaction(function () use ($order, $userId, $ratio, $refundId): void {
            $order->loadMissing('items.item.recipe.recipeItems.inventoryItem');

            foreach ($order->items as $orderItem) {
                $item = $orderItem->item;
                $recipe = $item?->recipe;

                if (!$recipe) {
                    continue;
                }

                $yieldQuantity = max(1.0, (float) $recipe->yield_quantity);

                foreach ($recipe->recipeItems as $recipeItem) {
                    $inventoryItem = $recipeItem->inventoryItem;
                    $perUnitQuantity = (float) $recipeItem->quantity;

                    if (!$inventoryItem || $perUnitQuantity <= 0) {
                        continue;
                    }

                    $restoreQuantity = (($perUnitQuantity * (float) $orderItem->quantity) / $yieldQuantity) * $ratio;
                    if ($restoreQuantity <= 0) {
                        continue;
                    }

                    // Only restore if the matching deduction actually happened.
                    // The deduction key is 'order:{id}:item:{itemId}:inv:{invId}';
                    // if it isn't present, the order never had its recipe stock
                    // deducted (e.g. refunded before payment confirmed) and we
                    // must not add phantom inventory.
                    $deductKey = 'order:' . $order->id . ':item:' . $orderItem->id . ':inv:' . $inventoryItem->id;
                    $wasDeducted = StockMovement::where('idempotency_key', $deductKey)->exists();
                    if (!$wasDeducted) {
                        continue;
                    }

                    $restoreKey = 'refund:order:' . $order->id . ':item:' . $orderItem->id . ':inv:' . $inventoryItem->id
                        . ($ratio >= 1.0 ? '' : ':partial:' . ($refundId ?? '0'));
                    $alreadyRestored = StockMovement::where('idempotency_key', $restoreKey)->exists();
                    if ($alreadyRestored) {
                        continue;
                    }

                    $lockedItem = DB::table('inventory_items')
                        ->where('id', $inventoryItem->id)
                        ->lockForUpdate()
                        ->first();

                    if (!$lockedItem) {
                        continue;
                    }

                    $oldStock = (float) $lockedItem->current_stock;

                    DB::table('inventory_items')
                        ->where('id', $inventoryItem->id)
                        ->increment('current_stock', $restoreQuantity);

                    $inventoryItem->refresh();

                    event(new StockLevelChanged(new StockLevelChangedData(
                        itemId: $inventoryItem->id,
                        itemName: $inventoryItem->name,
                        oldQuantity: $oldStock,
                        newQuantity: (float) $inventoryItem->current_stock,
                        reason: 'refund',
                    )));

                    StockMovement::create([
                        'idempotency_key' => $restoreKey,
                        'inventory_item_id' => $inventoryItem->id,
                        'user_id' => $userId ?? $order->user_id,
                        'type' => 'refund',
                        'quantity' => $restoreQuantity,
                        'balance_after' => $inventoryItem->current_stock,
                        'unit_cost' => $inventoryItem->unit_cost ?? 0,
                        'reference_type' => 'order',
                        'reference_id' => $order->id,
                        'notes' => $order->order_number ? "Refund of order {$order->order_number}" : 'Refund restore',
                    ]);
                }
            }
        });
    }

    public function deductForOrder(Order $order, ?int $userId = null): void
    {
        $this->deductForOrderAndDetectConflict($order, $userId);
    }

    /**
     * Deduct recipe inventory for an order. Returns true when any
     * ingredient ended up below zero (Policy A — sync still succeeds).
     */
    public function deductForOrderAndDetectConflict(Order $order, ?int $userId = null): bool
    {
        $hadConflict = false;

        DB::transaction(function () use ($order, $userId, &$hadConflict): void {
            $order->loadMissing('items.item.recipe.recipeItems.inventoryItem');

            foreach ($order->items as $orderItem) {
                $item = $orderItem->item;
                $recipe = $item?->recipe;

                if (!$recipe) {
                    continue;
                }

                $yieldQuantity = max(1.0, (float) $recipe->yield_quantity);

                foreach ($recipe->recipeItems as $recipeItem) {
                    $inventoryItem = $recipeItem->inventoryItem;
                    $perUnitQuantity = (float) $recipeItem->quantity;

                    if (!$inventoryItem || $perUnitQuantity <= 0) {
                        continue;
                    }

                    $neededQuantity = ($perUnitQuantity * (float) $orderItem->quantity) / $yieldQuantity;
                    if ($neededQuantity <= 0) {
                        continue;
                    }

                    // Include orderItem->id so two menu items sharing the same ingredient
                    // each produce a distinct key — without it only the first deduction
                    // is recorded and subsequent items silently skip.
                    $idempotencyKey = 'order:' . $order->id . ':item:' . $orderItem->id . ':inv:' . $inventoryItem->id;

                    // Lock the inventory row first to close the TOCTOU window.
                    // Without lockForUpdate(), two concurrent requests can both
                    // pass the exists() check, both decrement stock, and then
                    // the second StockMovement::create() fails on the unique
                    // constraint while the decrement has already run — causing
                    // double-deduction with no audit trail for the second write.
                    $lockedItem = DB::table('inventory_items')
                        ->where('id', $inventoryItem->id)
                        ->lockForUpdate()
                        ->first();

                    if (!$lockedItem) {
                        continue;
                    }

                    // Check idempotency inside the lock
                    $alreadyDeducted = StockMovement::where('idempotency_key', $idempotencyKey)->exists();
                    if ($alreadyDeducted) {
                        continue;
                    }

                    $oldStock = (float) $lockedItem->current_stock;

                    DB::table('inventory_items')
                        ->where('id', $inventoryItem->id)
                        ->decrement('current_stock', $neededQuantity);

                    $inventoryItem->refresh();

                    if ((float) $inventoryItem->current_stock < 0) {
                        $hadConflict = true;
                    }

                    event(new StockLevelChanged(new StockLevelChangedData(
                        itemId: $inventoryItem->id,
                        itemName: $inventoryItem->name,
                        oldQuantity: $oldStock,
                        newQuantity: (float) $inventoryItem->current_stock,
                        reason: 'sale',
                    )));

                    StockMovement::create([
                        'idempotency_key' => $idempotencyKey,
                        'inventory_item_id' => $inventoryItem->id,
                        'user_id' => $userId ?? $order->user_id,
                        'type' => 'sale',
                        'quantity' => -$neededQuantity,
                        'balance_after' => $inventoryItem->current_stock,
                        'unit_cost' => $inventoryItem->unit_cost ?? 0,
                        'reference_type' => 'order',
                        'reference_id' => $order->id,
                        'notes' => $order->order_number ? "Order {$order->order_number}" : 'Order deduction',
                    ]);
                }
            }
        });

        return $hadConflict;
    }
}
