<?php

declare(strict_types=1);

namespace App\Services;

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

                    $idempotencyKey = 'order:' . $order->id . ':inv:' . $inventoryItem->id;

                    $alreadyDeducted = StockMovement::where('idempotency_key', $idempotencyKey)->exists();
                    if ($alreadyDeducted) {
                        continue;
                    }

                    // Atomic decrement — prevents race condition
                    DB::table('inventory_items')
                        ->where('id', $inventoryItem->id)
                        ->decrement('current_stock', $neededQuantity);

                    $inventoryItem->refresh();

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
