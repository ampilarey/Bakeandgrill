<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\InventoryItem;
use App\Models\SiteSetting;
use App\Models\SupplierPriceHistory;

final class PurchaseRequestPriceHintService
{
    public const SHOW_HINTS_SETTING = 'purchase_requests_show_price_hints';

    public function enabled(): bool
    {
        return filter_var(SiteSetting::get(self::SHOW_HINTS_SETTING, '1'), FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * @param list<int> $inventoryItemIds
     * @return array<int, array{last_paid: float|null, cheapest: array{supplier_id: int, supplier_name: string|null, unit_price: float}|null, suppliers: list<array{supplier_id: int, supplier_name: string|null, unit_price: float, recorded_at: string|null}>}>
     */
    public function hintsForItems(array $inventoryItemIds): array
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $inventoryItemIds))));
        if ($ids === [] || !$this->enabled()) {
            return [];
        }

        $items = InventoryItem::query()->whereIn('id', $ids)->get(['id', 'last_purchase_price'])->keyBy('id');

        $latest = SupplierPriceHistory::query()
            ->whereIn('inventory_item_id', $ids)
            ->with('supplier:id,name')
            ->orderByDesc('recorded_at')
            ->orderByDesc('id')
            ->get()
            ->groupBy('inventory_item_id');

        $out = [];
        foreach ($ids as $id) {
            $rows = ($latest[$id] ?? collect())->unique('supplier_id')->sortBy('unit_price')->values();
            $cheapest = $rows->first();
            $lastPaid = (float) ($items[$id]->last_purchase_price ?? 0);

            $out[$id] = [
                'last_paid' => $lastPaid > 0 ? round($lastPaid, 4) : null,
                'cheapest' => $cheapest ? [
                    'supplier_id' => (int) $cheapest->supplier_id,
                    'supplier_name' => $cheapest->supplier?->name,
                    'unit_price' => (float) $cheapest->unit_price,
                ] : null,
                'suppliers' => $rows->take(5)->map(fn ($p) => [
                    'supplier_id' => (int) $p->supplier_id,
                    'supplier_name' => $p->supplier?->name,
                    'unit_price' => (float) $p->unit_price,
                    'recorded_at' => $p->recorded_at?->toDateString(),
                ])->values()->all(),
            ];
        }

        return $out;
    }
}
