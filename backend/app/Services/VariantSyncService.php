<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Item;
use App\Models\OrderItem;
use App\Models\Variant;

/**
 * Handles creating, updating, and soft-deactivating variants for a menu item.
 *
 * Variants that have been used in orders are never hard-deleted — they are
 * deactivated so historical order data remains intact.
 */
class VariantSyncService
{
    /**
     * Sync the full variants array for an item.
     *
     * Each element may contain an optional 'id' to update an existing variant.
     * Elements without 'id' are created. Existing variants not present in the
     * payload are NOT touched (use destroy() to remove/deactivate individually).
     *
     * @param array $variantsData Validated array from request
     */
    public function sync(Item $item, array $variantsData): void
    {
        foreach ($variantsData as $i => $data) {
            $id = $data['id'] ?? null;

            $fields = [
                'name' => $data['name'],
                'name_dv' => $data['name_dv'] ?? null,
                'price' => $data['price'],
                'cost' => $data['cost'] ?? null,
                'sku' => $data['sku'] ?? null,
                'barcode' => $data['barcode'] ?? null,
                'track_stock' => (bool) ($data['track_stock'] ?? false),
                'stock_qty' => (int) ($data['stock_qty'] ?? 0),
                'low_stock_threshold' => (int) ($data['low_stock_threshold'] ?? 5),
                'is_active' => isset($data['is_active']) ? (bool) $data['is_active'] : true,
                'sort_order' => $data['sort_order'] ?? $i,
            ];

            if ($id) {
                $variant = Variant::where('item_id', $item->id)->find($id);
                if ($variant) {
                    $variant->update($fields);
                }
            } else {
                $item->variants()->create($fields);
            }
        }
    }

    /**
     * Deactivate or hard-delete a single variant.
     *
     * Hard-deletes only when the variant has never appeared in any order.
     * Otherwise sets is_active = false so historical data is preserved.
     */
    public function destroy(Variant $variant): void
    {
        $usedInOrders = OrderItem::where('variant_id', $variant->id)->exists();

        if ($usedInOrders) {
            $variant->update(['is_active' => false]);
        } else {
            $variant->delete();
        }
    }
}
