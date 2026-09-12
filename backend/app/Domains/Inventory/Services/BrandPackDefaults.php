<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Services;

use App\Models\InventoryBrandPhoto;
use App\Models\InventoryItem;
use App\Models\InventoryPurchaseUnit;

/**
 * Keeps each pack's default price equal to what was last actually paid for it.
 *
 * Owner, 2026-09-12: "when the default amount is changed in manual po, the
 * latest values automatically update in the system."
 *
 * A price typed into the item editor is a guess that ages. A price typed onto
 * a purchase order is what a supplier is charging this week. So the editor
 * sets the opening figure and purchasing corrects it: write a different price
 * on a line and the pack it was bought as carries that price from then on.
 *
 * The price is stored against the pack that was actually used. Buy Amul's tin
 * and Amul's tin changes; buy the item's shared tin and the shared one does.
 * Nothing is inferred across brands — one brand going up does not quietly
 * raise the others.
 *
 * What is stored is the price of one *pack*, not of one base unit: it is the
 * number a buyer types and the number that should reappear. A line bought
 * loose, with no pack, has nothing to attach a default to and is skipped.
 */
final class BrandPackDefaults
{
    /**
     * Remember what a purchase line paid.
     *
     * Safe to call for every line of every order: it returns without a write
     * when there is no pack, no price, or nothing has changed.
     */
    public function rememberFromLine(
        ?InventoryItem $item,
        int|string|null $purchaseUnitId,
        float|int|string|null $pricePerPack,
    ): ?InventoryPurchaseUnit {
        if ($item === null || $purchaseUnitId === null || $purchaseUnitId === '') {
            return null;
        }

        $price = is_numeric($pricePerPack) ? round((float) $pricePerPack, 2) : null;
        if ($price === null || $price <= 0) {
            // Zero is a placeholder on a half-typed line, not a price that was
            // agreed. Overwriting a good default with it would be worse than
            // leaving the default alone.
            return null;
        }

        $pack = $item->purchaseUnits()->find($purchaseUnitId);
        if ($pack === null) {
            return null;
        }

        if ($pack->default_unit_cost !== null
            && abs((float) $pack->default_unit_cost - $price) < 0.005) {
            // Same price as last time. Leaving the timestamp alone means it
            // reads as "this price has held since March" rather than being
            // refreshed by every reorder.
            return $pack;
        }

        $pack->forceFill([
            'default_unit_cost' => $price,
            'default_cost_updated_at' => now(),
        ])->save();

        return $pack;
    }

    /**
     * What a purchase line should open at for one item bought as one brand.
     *
     * Brand-specific packs come first so a brand that has been set up wins
     * over the item's generic ones, and a pack that carries a price wins over
     * one that does not — an unpriced pack tells the buying screen nothing.
     *
     * @return array<int, array<string, mixed>>
     */
    public function packsFor(InventoryItem $item, ?string $brand): array
    {
        $key = InventoryBrandPhoto::keyFor($brand);

        return $item->purchaseUnits()
            ->when($key !== '', fn ($q) => $q->whereIn('brand_key', ['', $key]))
            ->when($key === '', fn ($q) => $q->where('brand_key', ''))
            ->get()
            ->sortBy([
                fn (InventoryPurchaseUnit $p) => $p->brand_key === '' ? 1 : 0,
                fn (InventoryPurchaseUnit $p) => $p->default_unit_cost === null ? 1 : 0,
                fn (InventoryPurchaseUnit $p) => mb_strtolower((string) $p->name),
            ])
            ->values()
            ->map(fn (InventoryPurchaseUnit $p) => [
                'id' => $p->id,
                'brand' => $p->brand,
                'brand_key' => $p->brand_key,
                'name' => $p->name,
                'base_units' => (float) $p->base_units,
                'barcode' => $p->barcode,
                'default_unit_cost' => $p->default_unit_cost === null ? null : (float) $p->default_unit_cost,
                'default_cost_updated_at' => $p->default_cost_updated_at?->toIso8601String(),
            ])
            ->all();
    }
}
