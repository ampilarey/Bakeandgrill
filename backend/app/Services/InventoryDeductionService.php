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
    public function deductForOrder(Order $order, ?int $userId = null): void
    {
        DB::transaction(function () use ($order, $userId): void {
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
    }
}
