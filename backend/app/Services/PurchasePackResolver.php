<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\InventoryItem;
use App\Models\InventoryPurchaseUnit;
use Illuminate\Validation\ValidationException;

/**
 * Turns "1 case at MVR 415" into "210 eggs at MVR 1.976190 each".
 *
 * Stock is counted in the item's own unit and every downstream number — the
 * weighted-average cost, price history, COGS, the restock plan — is per that
 * unit. Buying happens in packs. This is the one place the two meet, so the
 * conversion cannot drift between the admin purchase order and anything else
 * that grows a pack picker later.
 *
 * The money is the part worth being careful about. `total` is the pack
 * arithmetic, exactly what the shop was paid, and the per-unit cost is derived
 * from it rather than the other way round. Deriving the total from a rounded
 * per-unit cost would restate a MVR 415 case as MVR 415.80.
 */
final class PurchasePackResolver
{
    /**
     * @return array{quantity: float, unit_cost: float, total: float, pack_name: ?string, pack_size: ?float, pack_quantity: ?float}
     */
    public function resolve(
        ?InventoryItem $item,
        float $quantity,
        float $unitCost,
        int|string|null $purchaseUnitId,
    ): array {
        $pack = $this->pack($item, $purchaseUnitId);

        if ($pack === null) {
            // Bought loose, in the item's own unit. Unchanged behaviour, and
            // the shape every caller had before packs existed.
            return [
                'quantity' => $quantity,
                'unit_cost' => $unitCost,
                'total' => round($quantity * $unitCost, 2),
                'pack_name' => null,
                'pack_size' => null,
                'pack_quantity' => null,
            ];
        }

        $size = (float) $pack->base_units;

        // What the shop was paid: packs times the price of a pack.
        $total = round($quantity * $unitCost, 2);
        $baseQuantity = $quantity * $size;

        return [
            'quantity' => $baseQuantity,
            // Six decimals, matching the column. Rounding to money here is
            // what loses the case's real price.
            'unit_cost' => $baseQuantity > 0 ? round($total / $baseQuantity, 6) : 0.0,
            'total' => $total,
            'pack_name' => $pack->name,
            'pack_size' => $size,
            'pack_quantity' => $quantity,
        ];
    }

    /**
     * The pack, if one was named and it really belongs to this item.
     *
     * Refusing another item's pack matters: a case of eggs applied to a sack of
     * flour would multiply the stock by 210 and nobody would notice until the
     * shelf count came in.
     */
    private function pack(?InventoryItem $item, int|string|null $purchaseUnitId): ?InventoryPurchaseUnit
    {
        if ($purchaseUnitId === null || $purchaseUnitId === '' || $item === null) {
            return null;
        }

        $pack = InventoryPurchaseUnit::query()
            ->where('id', (int) $purchaseUnitId)
            ->where('inventory_item_id', $item->id)
            ->first();

        if ($pack === null) {
            throw ValidationException::withMessages([
                'items' => ['That pack size does not belong to the item on this line.'],
            ]);
        }

        if ((float) $pack->base_units <= 0) {
            throw ValidationException::withMessages([
                'items' => ['A pack has to hold more than nothing.'],
            ]);
        }

        return $pack;
    }
}
