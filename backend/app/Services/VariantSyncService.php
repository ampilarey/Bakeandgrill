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
     * Each element may carry an 'id' to update an existing variant; elements
     * without one are created. Sizes the payload leaves out are removed —
     * through {@see destroy()}, so one that has ever been ordered is
     * deactivated rather than deleted and its history stays intact.
     *
     * That pruning is the point of the word "full" in this method's name, and
     * it was missing: the editor's remove button only dropped the row from the
     * form, nothing ever called destroy(), and the omitted size stayed live.
     * Owner, 2026-09-01 audit: a deleted size went on selling on the POS, the
     * website and the app.
     *
     * @param array $variantsData Validated array from request
     */
    public function sync(Item $item, array $variantsData): void
    {
        $keptIds = [];

        foreach ($variantsData as $i => $data) {
            $id = $data['id'] ?? null;

            $fields = [
                'name' => $data['name'],
                'name_dv' => $data['name_dv'] ?? null,
                'price' => $data['price'],
                'cost' => $data['cost'] ?? null,
                'track_stock' => (bool) ($data['track_stock'] ?? false),
                'stock_qty' => (int) ($data['stock_qty'] ?? 0),
                'low_stock_threshold' => (int) ($data['low_stock_threshold'] ?? 5),
                // How much of the item's recipe one of this size uses — full 1,
                // half 0.5. Absent means a whole portion.
                'consumption_factor' => isset($data['consumption_factor'])
                    ? max(0.0, (float) $data['consumption_factor'])
                    : 1.0,
                'is_active' => isset($data['is_active']) ? (bool) $data['is_active'] : true,
                'is_available' => isset($data['is_available']) ? (bool) $data['is_available'] : true,
                'sort_order' => $data['sort_order'] ?? $i,
            ];

            // Scan codes are absent-means-leave-alone, not absent-means-clear.
            //
            // The item editor has a SKU box per size and no barcode box at all,
            // so every save sent sku and omitted barcode — and this method wrote
            // `$data['barcode'] ?? null` straight over the top. A barcode set
            // through the variants API or an import survived until the next time
            // anyone opened the dish and pressed Save, then vanished with
            // nothing said. Owner, 2026-09-01.
            //
            // Sending the key explicitly with null still clears it, so a form
            // that does own the field keeps working.
            foreach (['sku', 'barcode'] as $code) {
                if (array_key_exists($code, $data)) {
                    $value = is_string($data[$code]) ? trim($data[$code]) : $data[$code];
                    $fields[$code] = ($value === '' || $value === null) ? null : $value;
                } elseif (!$id) {
                    // A brand-new row has nothing to preserve.
                    $fields[$code] = null;
                }
            }

            $stock = app(StockManagementService::class);
            $actorId = auth()->id();
            if ($id) {
                $variant = Variant::where('item_id', $item->id)->find($id);
                if ($variant) {
                    $before = (int) $variant->stock_qty;
                    $variant->update($fields);
                    $stock->recordVariantStockEdit($variant, $before, (int) $variant->stock_qty, $actorId, 'Edited in item editor');
                    $keptIds[] = (int) $variant->id;
                }
            } else {
                $created = $item->variants()->create($fields);
                if ((int) $created->stock_qty !== 0) {
                    $stock->recordVariantStockEdit($created, 0, (int) $created->stock_qty, $actorId, 'Opening count from item editor');
                }
                $keptIds[] = (int) $created->id;
            }
        }

        $this->pruneMissing($item, $keptIds);
    }

    /**
     * Remove the sizes this item has that the payload did not mention.
     *
     * Uses the same rule as a single delete: one that has ever been ordered is
     * deactivated so old receipts and reports still resolve it; one that never
     * sold is deleted outright. Its reservations and low-stock alerts null out,
     * its special-price overrides cascade away.
     *
     * @param list<int> $keptIds
     */
    private function pruneMissing(Item $item, array $keptIds): void
    {
        $stale = Variant::query()
            ->where('item_id', $item->id)
            ->when($keptIds !== [], fn ($q) => $q->whereNotIn('id', $keptIds))
            ->get();

        foreach ($stale as $variant) {
            $this->destroy($variant);
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
