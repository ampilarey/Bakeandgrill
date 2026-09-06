<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Services;

use App\Models\InventoryItem;
use App\Models\InventoryReorderAlert;
use App\Models\SiteSetting;
use App\Models\SupplierPriceHistory;
use App\Models\WasteLog;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Combines usage runway, buy frequency, and ROP to suggest restock timing/qty.
 * Suggested ROP is advisory until applySuggestedReorderPoints() is called explicitly.
 */
final class RestockIntelligenceService
{
    /**
     * Max share of usage that waste may add to the effective daily rate (clamp).
     * Prevents absurd order sizes when waste spikes.
     */
    private const WASTE_RATE_CLAMP_VS_USAGE = 1.0;

    /**
     * @return array{
     *     lookback_days: int,
     *     buy_lookback_days: int,
     *     lead_days: int,
     *     cover_days: int,
     *     include_waste: bool,
     *     high_waste_pct: float,
     *     totals: array{items_count: int, due_soon: int, below_rop: int, with_open_po: int, price_up: int, open_alerts: int, snoozed: int, excluded: int, high_waste: int},
     *     items: list<array<string, mixed>>
     * }
     */
    public function restockPlan(
        int $lookbackDays = 30,
        int $buyLookbackDays = 90,
        int $leadDays = 3,
        int $coverDays = 14,
        ?bool $includeWaste = null,
    ): array {
        $lookbackDays = min(max($lookbackDays, 7), 180);
        $buyLookbackDays = min(max($buyLookbackDays, 30), 365);
        $leadDays = min(max($leadDays, 0), 30);
        $coverDays = min(max($coverDays, 1), 90);

        $includeWaste = $includeWaste ?? filter_var(
            SiteSetting::get('restock_include_waste', '0'),
            FILTER_VALIDATE_BOOLEAN,
        );
        $highWastePct = (float) SiteSetting::get('restock_high_waste_pct', '15');
        if ($highWastePct < 0) {
            $highWastePct = 0;
        }
        if ($highWastePct > 100) {
            $highWastePct = 100;
        }

        $usageByItem = $this->usageByItem($lookbackDays);
        $wasteByItem = $this->wasteByItem($lookbackDays);
        $buyByItem = $this->buyHistoryByItem($buyLookbackDays);
        $today = now()->startOfDay();

        $items = InventoryItem::query()
            ->where('is_active', true)
            ->with(['category:id,name', 'preferredSupplier:id,name'])
            ->orderBy('name')
            ->get();

        $itemIds = $items->pluck('id')->all();
        $cheapestByItem = $this->cheapestSupplierByItem($itemIds);
        $openPoByItem = $this->openPurchaseByItem($itemIds);
        $openAlertByItem = $this->openAlertByItem($itemIds);

        $rows = [];
        $dueSoon = 0;
        $belowRop = 0;
        $withOpenPo = 0;
        $priceUp = 0;
        $withOpenAlert = 0;
        $snoozedCount = 0;
        $excludedCount = 0;
        $highWasteCount = 0;

        foreach ($items as $item) {
            $stock = (float) ($item->current_stock ?? 0);
            $rop = (float) ($item->reorder_point ?? 0);
            $reorderQty = (float) ($item->reorder_quantity ?? 0);
            $consumed = (float) ($usageByItem[$item->id] ?? 0);
            $wasted = (float) ($wasteByItem[$item->id] ?? 0);
            $usageDaily = $lookbackDays > 0 ? round($consumed / $lookbackDays, 4) : 0.0;
            $wasteDailyRaw = $lookbackDays > 0 ? round($wasted / $lookbackDays, 4) : 0.0;
            $wasteDaily = $this->clampWasteDailyRate($usageDaily, $wasteDailyRaw);
            $wastePct = ($usageDaily + $wasteDailyRaw) > 0
                ? round(($wasteDailyRaw / ($usageDaily + $wasteDailyRaw)) * 100, 2)
                : 0.0;
            $highWaste = $wastePct >= $highWastePct && $wasteDailyRaw > 0;

            $dailyRate = $includeWaste
                ? round($usageDaily + $wasteDaily, 4)
                : $usageDaily;

            $daysLeft = $dailyRate > 0 ? (int) floor($stock / $dailyRate) : null;
            $status = $this->stockStatus($stock, $rop, $daysLeft);

            $buy = $buyByItem[$item->id] ?? null;
            $itemLeadSet = $item->lead_days !== null;
            $effectiveLead = $itemLeadSet
                ? min(max((int) $item->lead_days, 0), 30)
                : $leadDays;
            $leadSource = $itemLeadSet ? 'item' : 'default';

            $itemCoverSet = $item->cover_days !== null;
            $effectiveCover = $itemCoverSet
                ? min(max((int) $item->cover_days, 1), 90)
                : $coverDays;
            $coverSource = $itemCoverSet ? 'item' : 'default';

            $suggestedRop = $dailyRate > 0
                ? round($dailyRate * max(1, $effectiveLead) * 1.5, 2)
                : null;

            $qtyInfo = $this->suggestedOrderQuantity(
                $stock,
                $rop,
                $reorderQty,
                $dailyRate,
                $effectiveCover,
            );

            $nextOrder = $this->suggestedNextOrderDate(
                $today,
                $daysLeft,
                $effectiveLead,
                $buy['last_purchase_date'] ?? null,
                $buy['avg_days_between'] ?? null,
                $stock <= $rop,
            );

            $due = $nextOrder !== null && Carbon::parse($nextOrder)->lte($today->copy()->addDays($effectiveLead));
            $wouldBeDueSoon = $due || in_array($status, ['out_of_stock', 'critical', 'low'], true);

            $snoozeUntil = $item->restock_snoozed_until;
            $isSnoozed = $snoozeUntil !== null && $snoozeUntil->copy()->startOfDay()->gte($today);
            $isExcluded = (bool) $item->restock_excluded;
            // Snoozed / excluded SKUs drop out of due-soon / draft-PO urgency.
            $dueSoonFlag = $wouldBeDueSoon && !$isSnoozed && !$isExcluded;

            // Keep the plan focused: items with usage, waste, buy history, or below ROP.
            if ($usageDaily <= 0 && $wasteDailyRaw <= 0 && $buy === null && !($rop > 0 && $stock <= $rop)) {
                continue;
            }

            if ($isExcluded) {
                $excludedCount++;
            } elseif ($isSnoozed) {
                $snoozedCount++;
            }
            if ($dueSoonFlag) {
                $dueSoon++;
            }
            if ($rop > 0 && $stock <= $rop && !$isExcluded) {
                $belowRop++;
            }
            if ($highWaste && !$isExcluded) {
                $highWasteCount++;
            }

            $supplier = null;
            if ($item->preferred_supplier_id && $item->preferredSupplier) {
                $prefPrice = $cheapestByItem[$item->id][$item->preferred_supplier_id]['price']
                    ?? (float) ($item->last_purchase_price ?? 0);
                $supplier = [
                    'id' => (int) $item->preferred_supplier_id,
                    'name' => $item->preferredSupplier->name,
                    'price' => (float) $prefPrice,
                    'source' => 'preferred',
                ];
            } elseif (isset($cheapestByItem[$item->id])) {
                $best = collect($cheapestByItem[$item->id])->sortBy('price')->first();
                if ($best) {
                    $supplier = [
                        'id' => (int) $best['supplier_id'],
                        'name' => (string) $best['supplier_name'],
                        'price' => (float) $best['price'],
                        'source' => 'cheapest',
                    ];
                }
            }

            $unitCost = (float) ($supplier['price'] ?? $item->last_purchase_price ?? $item->unit_cost ?? 0);
            $lastPurchasePrice = (float) ($item->last_purchase_price ?? 0);
            $priceChange = $this->priceChangeVsLast(
                $unitCost > 0 ? $unitCost : null,
                $lastPurchasePrice > 0 ? $lastPurchasePrice : null,
            );
            if ($priceChange['direction'] === 'up' && !$isExcluded) {
                $priceUp++;
            }

            $openPurchase = $openPoByItem[$item->id] ?? null;
            if ($openPurchase !== null && !$isExcluded) {
                $withOpenPo++;
            }

            $openAlert = $openAlertByItem[$item->id] ?? null;
            if ($openAlert !== null && !$isExcluded) {
                $withOpenAlert++;
            }

            $rows[] = [
                'id' => $item->id,
                'name' => $item->name,
                'unit' => $item->unit,
                'category' => $item->category?->name,
                'current_stock' => $stock,
                'reorder_point' => $rop,
                'reorder_quantity' => $reorderQty > 0 ? $reorderQty : null,
                'daily_usage_rate' => $usageDaily,
                'waste_daily_rate' => $wasteDailyRaw,
                'waste_daily_rate_clamped' => $wasteDaily,
                'waste_pct' => $wastePct,
                'high_waste' => $highWaste,
                'effective_daily_rate' => $dailyRate,
                'include_waste' => $includeWaste,
                'days_of_stock' => $daysLeft,
                'status' => $status,
                'buy_frequency' => $buy,
                'suggested_next_order_date' => $nextOrder,
                'suggested_order_qty' => $qtyInfo['qty'],
                'suggested_reorder_point' => $suggestedRop,
                'reason' => $qtyInfo['reason'],
                'due_soon' => $dueSoonFlag,
                'would_be_due_soon' => $wouldBeDueSoon,
                'snoozed' => $isSnoozed && !$isExcluded,
                'restock_snoozed_until' => $snoozeUntil?->toDateString(),
                'excluded' => $isExcluded,
                'lead_days' => $effectiveLead,
                'lead_days_source' => $leadSource,
                'cover_days' => $effectiveCover,
                'cover_days_source' => $coverSource,
                'unit_cost' => $unitCost > 0 ? round($unitCost, 4) : null,
                'last_purchase_price' => $lastPurchasePrice > 0 ? round($lastPurchasePrice, 4) : null,
                'price_change_pct' => $priceChange['pct'],
                'price_change' => $priceChange['direction'],
                'suggested_supplier' => $supplier,
                'open_purchase' => $openPurchase,
                'open_alert' => $openAlert,
            ];
        }

        usort($rows, function (array $a, array $b): int {
            $rank = static fn (?int $d, string $status): int => match (true) {
                $status === 'out_of_stock' => -1,
                $status === 'critical' => 0,
                $d === null => 9999,
                default => $d,
            };

            return $rank($a['days_of_stock'], $a['status']) <=> $rank($b['days_of_stock'], $b['status'])
                ?: strcmp((string) $a['name'], (string) $b['name']);
        });

        return [
            'lookback_days' => $lookbackDays,
            'buy_lookback_days' => $buyLookbackDays,
            'lead_days' => $leadDays,
            'cover_days' => $coverDays,
            'include_waste' => $includeWaste,
            'high_waste_pct' => $highWastePct,
            'totals' => [
                'items_count' => count($rows),
                'due_soon' => $dueSoon,
                'below_rop' => $belowRop,
                'with_open_po' => $withOpenPo,
                'price_up' => $priceUp,
                'open_alerts' => $withOpenAlert,
                'snoozed' => $snoozedCount,
                'excluded' => $excludedCount,
                'high_waste' => $highWasteCount,
            ],
            'items' => $rows,
        ];
    }

    /**
     * @return array<int, float> inventory_item_id => total waste qty in lookback
     */
    private function wasteByItem(int $lookbackDays): array
    {
        $since = now()->subDays($lookbackDays)->startOfDay();

        $rows = WasteLog::query()
            ->whereNotNull('inventory_item_id')
            ->where('created_at', '>=', $since)
            ->selectRaw('inventory_item_id, SUM(ABS(quantity)) as total')
            ->groupBy('inventory_item_id')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $out[(int) $row->inventory_item_id] = (float) $row->total;
        }

        return $out;
    }

    private function clampWasteDailyRate(float $usageDaily, float $wasteDailyRaw): float
    {
        if ($wasteDailyRaw <= 0) {
            return 0.0;
        }
        if ($usageDaily <= 0) {
            // No usage baseline — allow waste but cap to raw (still surfaces the item).
            return round($wasteDailyRaw, 4);
        }

        $cap = $usageDaily * self::WASTE_RATE_CLAMP_VS_USAGE;

        return round(min($wasteDailyRaw, $cap), 4);
    }

    /**
     * Open (unresolved) reorder alerts keyed by inventory item id.
     *
     * @param list<int|string> $itemIds
     * @return array<int, array{id: int, current_stock: float, reorder_point: float, created_at: string|null}>
     */
    private function openAlertByItem(array $itemIds): array
    {
        if ($itemIds === []) {
            return [];
        }

        $rows = InventoryReorderAlert::query()
            ->whereIn('inventory_item_id', $itemIds)
            ->whereNull('resolved_at')
            ->orderByDesc('id')
            ->get(['id', 'inventory_item_id', 'current_stock', 'reorder_point', 'created_at']);

        $out = [];
        foreach ($rows as $row) {
            $itemId = (int) $row->inventory_item_id;
            if (isset($out[$itemId])) {
                continue;
            }
            $out[$itemId] = [
                'id' => (int) $row->id,
                'current_stock' => (float) $row->current_stock,
                'reorder_point' => (float) $row->reorder_point,
                'created_at' => $row->created_at?->toIso8601String(),
            ];
        }

        return $out;
    }

    /**
     * Compare suggested buy price to last received purchase price.
     *
     * @return array{direction: 'up'|'down'|'flat'|null, pct: float|null}
     */
    private function priceChangeVsLast(?float $suggested, ?float $last): array
    {
        if ($suggested === null || $suggested <= 0 || $last === null || $last <= 0) {
            return ['direction' => null, 'pct' => null];
        }

        $pct = round((($suggested - $last) / $last) * 100, 1);
        // Ignore sub-1% noise from rounding / minor variance.
        if (abs($pct) < 1.0) {
            return ['direction' => 'flat', 'pct' => 0.0];
        }

        return [
            'direction' => $pct > 0 ? 'up' : 'down',
            'pct' => $pct,
        ];
    }

    /**
     * Latest open (draft/ordered/partial) PO line per inventory item, if any.
     *
     * @param list<int|string> $itemIds
     * @return array<int, array{id: int, purchase_number: string, status: string, quantity: float}>
     */
    private function openPurchaseByItem(array $itemIds): array
    {
        if ($itemIds === []) {
            return [];
        }

        $rows = DB::table('purchase_items')
            ->join('purchases', 'purchases.id', '=', 'purchase_items.purchase_id')
            ->whereIn('purchase_items.inventory_item_id', $itemIds)
            ->whereNull('purchases.deleted_at')
            ->whereIn('purchases.status', ['draft', 'ordered', 'partial'])
            ->orderByDesc('purchases.id')
            ->select([
                'purchase_items.inventory_item_id',
                'purchases.id as purchase_id',
                'purchases.purchase_number',
                'purchases.status',
                'purchase_items.quantity',
            ])
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $itemId = (int) $row->inventory_item_id;
            if (isset($out[$itemId])) {
                continue; // already have newest PO for this item
            }
            $out[$itemId] = [
                'id' => (int) $row->purchase_id,
                'purchase_number' => (string) $row->purchase_number,
                'status' => (string) $row->status,
                'quantity' => (float) $row->quantity,
            ];
        }

        return $out;
    }

    /**
     * Write suggested reorder points onto inventory items (explicit opt-in).
     *
     * @param list<int> $itemIds
     * @return array{
     *     updated_count: int,
     *     skipped_count: int,
     *     updated: list<array{id: int, name: string, from: float, to: float}>,
     *     skipped: list<array{id: int, reason: string}>
     * }
     */
    public function applySuggestedReorderPoints(
        array $itemIds,
        int $lookbackDays = 30,
        int $buyLookbackDays = 90,
        int $leadDays = 3,
        int $coverDays = 14,
    ): array {
        $itemIds = array_values(array_unique(array_map('intval', $itemIds)));
        $plan = $this->restockPlan($lookbackDays, $buyLookbackDays, $leadDays, $coverDays);
        /** @var array<int, array<string, mixed>> $byId */
        $byId = [];
        foreach ($plan['items'] as $row) {
            $byId[(int) $row['id']] = $row;
        }

        $updated = [];
        $skipped = [];

        DB::transaction(function () use ($itemIds, $byId, &$updated, &$skipped): void {
            foreach ($itemIds as $id) {
                $row = $byId[$id] ?? null;
                if ($row === null || $row['suggested_reorder_point'] === null) {
                    $skipped[] = ['id' => $id, 'reason' => 'no_suggestion'];

                    continue;
                }

                $newRop = round((float) $row['suggested_reorder_point'], 2);
                if ($newRop < 0) {
                    $skipped[] = ['id' => $id, 'reason' => 'invalid_suggestion'];

                    continue;
                }

                $item = InventoryItem::query()->lockForUpdate()->find($id);
                if ($item === null) {
                    $skipped[] = ['id' => $id, 'reason' => 'not_found'];

                    continue;
                }

                $oldRop = round((float) ($item->reorder_point ?? 0), 2);
                if (abs($oldRop - $newRop) < 0.001) {
                    $skipped[] = ['id' => $id, 'reason' => 'unchanged'];

                    continue;
                }

                $item->reorder_point = $newRop;
                $item->save();

                $updated[] = [
                    'id' => $id,
                    'name' => (string) $item->name,
                    'from' => $oldRop,
                    'to' => $newRop,
                ];
            }
        });

        return [
            'updated_count' => count($updated),
            'skipped_count' => count($skipped),
            'updated' => $updated,
            'skipped' => $skipped,
        ];
    }

    /**
     * Opt-in: promote restock "cheapest" supplier suggestions to preferred_supplier_id.
     *
     * @param list<int> $itemIds
     * @return array{
     *     updated_count: int,
     *     skipped_count: int,
     *     updated: list<array{id: int, name: string, supplier_id: int, supplier_name: string}>,
     *     skipped: list<array{id: int, reason: string}>
     * }
     */
    public function applySuggestedPreferredSuppliers(
        array $itemIds,
        int $lookbackDays = 30,
        int $buyLookbackDays = 90,
        int $leadDays = 3,
        int $coverDays = 14,
    ): array {
        $itemIds = array_values(array_unique(array_map('intval', $itemIds)));
        $plan = $this->restockPlan($lookbackDays, $buyLookbackDays, $leadDays, $coverDays);
        /** @var array<int, array<string, mixed>> $byId */
        $byId = [];
        foreach ($plan['items'] as $row) {
            $byId[(int) $row['id']] = $row;
        }

        $updated = [];
        $skipped = [];

        DB::transaction(function () use ($itemIds, $byId, &$updated, &$skipped): void {
            foreach ($itemIds as $id) {
                $row = $byId[$id] ?? null;
                $supplier = is_array($row['suggested_supplier'] ?? null) ? $row['suggested_supplier'] : null;
                if ($row === null || $supplier === null || empty($supplier['id'])) {
                    $skipped[] = ['id' => $id, 'reason' => 'no_suggestion'];

                    continue;
                }

                if (($supplier['source'] ?? null) !== 'cheapest') {
                    $skipped[] = ['id' => $id, 'reason' => 'not_cheapest_suggestion'];

                    continue;
                }

                $supplierId = (int) $supplier['id'];
                $item = InventoryItem::query()->lockForUpdate()->find($id);
                if ($item === null) {
                    $skipped[] = ['id' => $id, 'reason' => 'not_found'];

                    continue;
                }

                if ((int) ($item->preferred_supplier_id ?? 0) === $supplierId) {
                    $skipped[] = ['id' => $id, 'reason' => 'unchanged'];

                    continue;
                }

                $item->preferred_supplier_id = $supplierId;
                $item->save();

                $updated[] = [
                    'id' => $id,
                    'name' => (string) $item->name,
                    'supplier_id' => $supplierId,
                    'supplier_name' => (string) ($supplier['name'] ?? ''),
                ];
            }
        });

        return [
            'updated_count' => count($updated),
            'skipped_count' => count($skipped),
            'updated' => $updated,
            'skipped' => $skipped,
        ];
    }

    /**
     * Resolve open reorder alerts for the given inventory items.
     *
     * @param list<int> $itemIds
     * @return int Number of alerts newly resolved
     */
    public function resolveOpenAlertsForItems(array $itemIds): int
    {
        $itemIds = array_values(array_unique(array_map('intval', $itemIds)));
        if ($itemIds === []) {
            return 0;
        }

        return InventoryReorderAlert::query()
            ->whereIn('inventory_item_id', $itemIds)
            ->whereNull('resolved_at')
            ->update(['resolved_at' => now()]);
    }

    /**
     * Usage-aware order qty for PO suggest (falls back to 2×ROP formula).
     *
     * @return array{qty: float, reason: string}
     */
    public function suggestedOrderQuantity(
        float $currentStock,
        float $reorderPoint,
        float $reorderQuantity,
        float $dailyUsageRate,
        int $coverDays = 14,
    ): array {
        $ropBased = max(
            $reorderQuantity > 0 ? $reorderQuantity : ($reorderPoint > 0 ? $reorderPoint : 1),
            ($reorderPoint * 2) - $currentStock,
        );

        if ($dailyUsageRate > 0) {
            $usageBased = ($dailyUsageRate * $coverDays) - $currentStock;
            if ($usageBased > $ropBased) {
                return [
                    'qty' => max(1, round($usageBased, 2)),
                    'reason' => 'usage_cover',
                ];
            }
        }

        if ($reorderQuantity > 0 && $ropBased <= $reorderQuantity) {
            return [
                'qty' => max(1, round($reorderQuantity, 2)),
                'reason' => 'reorder_quantity',
            ];
        }

        return [
            'qty' => max(1, round($ropBased, 2)),
            'reason' => 'reorder_point',
        ];
    }

    /** @return array<int, float> inventory_item_id => consumed qty */
    private function usageByItem(int $lookbackDays): array
    {
        return DB::table('stock_movements')
            /*
             * Consumption is written as `sale` movements; nothing has ever
             * written `deduction`, which is all this read — so usage always
             * came back zero and every cover-days suggestion silently fell
             * back to reorder-point maths. `deduction` stays for legacy rows.
             * Waste is deliberately NOT here: this service reads WasteLog
             * separately and adds it under the include_waste toggle, so
             * counting `waste` movements too would double it.
             */
            ->whereIn('type', ['sale', 'deduction'])
            ->where('created_at', '>=', now()->subDays($lookbackDays))
            ->where('quantity', '<', 0)
            ->selectRaw('inventory_item_id, SUM(ABS(quantity)) as consumed')
            ->groupBy('inventory_item_id')
            ->pluck('consumed', 'inventory_item_id')
            ->map(fn ($v) => (float) $v)
            ->all();
    }

    /**
     * @return array<int, array{
     *     purchase_count: int,
     *     avg_days_between: float|null,
     *     avg_buy_qty: float,
     *     last_purchase_date: string|null,
     *     last_buy_qty: float|null
     * }>
     */
    private function buyHistoryByItem(int $buyLookbackDays): array
    {
        $fromDate = now()->subDays($buyLookbackDays)->toDateString();

        $lines = DB::table('purchase_items')
            ->join('purchases', 'purchases.id', '=', 'purchase_items.purchase_id')
            ->whereNotNull('purchase_items.inventory_item_id')
            ->where('purchase_items.received_quantity', '>', 0)
            // No status filter: the received quantity above is the delivery.
            // A short-closed order still delivered what it delivered, and
            // dropping it would skew how often we really buy this item.
            ->whereNull('purchases.deleted_at')
            ->whereRaw(
                'DATE(COALESCE(purchases.actual_delivery_date, purchases.purchase_date)) >= ?',
                [$fromDate],
            )
            ->select([
                'purchase_items.inventory_item_id',
                'purchase_items.received_quantity',
                'purchases.id as purchase_id',
                DB::raw('DATE(COALESCE(purchases.actual_delivery_date, purchases.purchase_date)) as event_date'),
            ])
            ->orderBy('event_date')
            ->get();

        /** @var array<int, list<array{date: string, qty: float, purchase_id: int}>> $byItem */
        $byItem = [];
        foreach ($lines as $line) {
            $itemId = (int) $line->inventory_item_id;
            $byItem[$itemId][] = [
                'date' => (string) $line->event_date,
                'qty' => (float) $line->received_quantity,
                'purchase_id' => (int) $line->purchase_id,
            ];
        }

        $out = [];
        foreach ($byItem as $itemId => $events) {
            // Collapse multiple lines on the same PO+date into one buy event.
            $collapsed = [];
            foreach ($events as $ev) {
                $key = $ev['purchase_id'] . '|' . $ev['date'];
                if (!isset($collapsed[$key])) {
                    $collapsed[$key] = ['date' => $ev['date'], 'qty' => 0.0];
                }
                $collapsed[$key]['qty'] += $ev['qty'];
            }
            $events = array_values($collapsed);
            usort($events, fn ($a, $b) => strcmp($a['date'], $b['date']));

            $gaps = [];
            for ($i = 1; $i < count($events); $i++) {
                $gaps[] = abs(Carbon::parse($events[$i]['date'])->diffInDays(Carbon::parse($events[$i - 1]['date'])));
            }

            $qtySum = array_sum(array_column($events, 'qty'));
            $last = $events[count($events) - 1] ?? null;

            $out[$itemId] = [
                'purchase_count' => count($events),
                'avg_days_between' => $gaps !== []
                    ? round(array_sum($gaps) / count($gaps), 1)
                    : null,
                'avg_buy_qty' => count($events) > 0 ? round($qtySum / count($events), 2) : 0.0,
                'last_purchase_date' => $last['date'] ?? null,
                'last_buy_qty' => isset($last) ? round((float) $last['qty'], 2) : null,
            ];
        }

        return $out;
    }

    /**
     * @param list<int|string> $itemIds
     * @return array<int, array<int, array{supplier_id: int, supplier_name: string, price: float}>>
     */
    private function cheapestSupplierByItem(array $itemIds): array
    {
        if ($itemIds === []) {
            return [];
        }

        $rows = SupplierPriceHistory::query()
            ->join('suppliers', 'suppliers.id', '=', 'supplier_price_history.supplier_id')
            ->whereIn('supplier_price_history.inventory_item_id', $itemIds)
            ->whereNull('suppliers.deleted_at')
            ->selectRaw('supplier_price_history.inventory_item_id, supplier_price_history.supplier_id, suppliers.name as supplier_name, MIN(supplier_price_history.unit_price) as min_price')
            ->groupBy('supplier_price_history.inventory_item_id', 'supplier_price_history.supplier_id', 'suppliers.name')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $itemId = (int) $row->inventory_item_id;
            $supplierId = (int) $row->supplier_id;
            $out[$itemId][$supplierId] = [
                'supplier_id' => $supplierId,
                'supplier_name' => (string) $row->supplier_name,
                'price' => (float) $row->min_price,
            ];
        }

        return $out;
    }

    private function suggestedNextOrderDate(
        Carbon $today,
        ?int $daysOfStock,
        int $leadDays,
        ?string $lastPurchaseDate,
        ?float $avgDaysBetween,
        bool $belowRop,
    ): ?string {
        if ($belowRop || ($daysOfStock !== null && $daysOfStock <= $leadDays)) {
            return $today->toDateString();
        }

        $fromUsage = null;
        if ($daysOfStock !== null) {
            $fromUsage = $today->copy()->addDays(max(0, $daysOfStock - $leadDays));
        }

        $fromBuy = null;
        if ($lastPurchaseDate && $avgDaysBetween !== null && $avgDaysBetween > 0) {
            $fromBuy = Carbon::parse($lastPurchaseDate)->addDays((int) round($avgDaysBetween));
            if ($fromBuy->lt($today)) {
                $fromBuy = $today->copy();
            }
        }

        if ($fromUsage && $fromBuy) {
            return $fromUsage->lt($fromBuy) ? $fromUsage->toDateString() : $fromBuy->toDateString();
        }

        return ($fromUsage ?? $fromBuy)?->toDateString();
    }

    /**
     * Build a draft Purchase Request from the restock plan (below ROP or due by next-order date).
     *
     * @return array{
     *     request: \App\Models\PurchaseRequest|null,
     *     preview: list<array{inventory_item_id: int, name: string, requested_qty: float, unit: string, estimated_unit_cost_laar: int|null, reason: string}>,
     *     skipped: list<array{id: int, name: string, reason: string}>,
     *     warning: string|null
     * }
     */
    public function buildRestockRequestDraft(
        \App\Models\User $user,
        \Illuminate\Http\Request $request,
        int $lookbackDays = 30,
        int $buyLookbackDays = 90,
        int $leadDays = 3,
        int $coverDays = 14,
        bool $onlyBelowRop = false,
    ): array {
        $plan = $this->restockPlan($lookbackDays, $buyLookbackDays, $leadDays, $coverDays);
        $today = now()->startOfDay();

        $openRestockItemIds = $this->openRestockPurchaseRequestItemIds();
        $openRestockExists = $openRestockItemIds !== [];

        $preview = [];
        $skipped = [];

        foreach ($plan['items'] as $row) {
            $id = (int) $row['id'];
            $name = (string) $row['name'];

            if (!empty($row['excluded'])) {
                $skipped[] = ['id' => $id, 'name' => $name, 'reason' => 'excluded'];

                continue;
            }
            if (!empty($row['snoozed'])) {
                $skipped[] = ['id' => $id, 'name' => $name, 'reason' => 'snoozed'];

                continue;
            }

            $stock = (float) ($row['current_stock'] ?? 0);
            $rop = (float) ($row['reorder_point'] ?? 0);
            $belowRop = $rop > 0 && $stock <= $rop;
            $nextOrder = $row['suggested_next_order_date'] ?? null;
            $dueByDate = $nextOrder !== null && Carbon::parse((string) $nextOrder)->lte($today);

            if ($onlyBelowRop) {
                if (!$belowRop) {
                    continue;
                }
            } elseif (!$belowRop && !$dueByDate) {
                continue;
            }

            if (isset($openRestockItemIds[$id])) {
                $skipped[] = ['id' => $id, 'name' => $name, 'reason' => 'already_on_open_restock_request'];

                continue;
            }

            $qty = (float) ($row['suggested_order_qty'] ?? 0);
            if ($qty <= 0) {
                $skipped[] = ['id' => $id, 'name' => $name, 'reason' => 'no_suggested_qty'];

                continue;
            }

            $lastPaid = (float) ($row['last_purchase_price'] ?? 0);
            $estimatedLaar = $lastPaid > 0 ? (int) round($lastPaid * 100) : null;
            $reason = $belowRop ? 'below_rop' : 'due_by_date';

            $preview[] = [
                'inventory_item_id' => $id,
                'name' => $name,
                'requested_qty' => $qty,
                'unit' => (string) ($row['unit'] ?? 'pcs'),
                'estimated_unit_cost_laar' => $estimatedLaar,
                'reason' => $reason,
            ];
        }

        $warning = $openRestockExists
            ? 'Some items were skipped because they are already on an open restock purchase request.'
            : null;

        if ($preview === []) {
            return [
                'request' => null,
                'preview' => [],
                'skipped' => $skipped,
                'warning' => $warning ?? 'No items need restocking for the current plan.',
            ];
        }

        $lines = array_map(static fn (array $p): array => [
            'inventory_item_id' => $p['inventory_item_id'],
            'requested_qty' => $p['requested_qty'],
            'requested_unit' => $p['unit'],
            'estimated_unit_cost_laar' => $p['estimated_unit_cost_laar'],
            'reason' => 'low_stock',
            'notes' => 'Restock: ' . $p['reason'],
        ], $preview);

        $pr = app(\App\Services\PurchaseRequestService::class)->create(
            $user,
            [
                'title' => 'Auto reorder ' . $today->toDateString(),
                'source' => 'restock',
                'priority' => 'normal',
                'notes' => 'Generated from restock forecast',
            ],
            $lines,
            $request,
        );

        return [
            'request' => $pr->fresh(['items.inventoryItem', 'requester']),
            'preview' => $preview,
            'skipped' => $skipped,
            'warning' => $warning,
        ];
    }

    /** @return array<int, true> inventory_item_id => true */
    private function openRestockPurchaseRequestItemIds(): array
    {
        $openStatuses = [
            'requested',
            'approved',
            'assigned',
            'buying',
            'partially_bought',
            'bought_pending_verification',
            'received',
        ];

        $ids = DB::table('purchase_request_items as pri')
            ->join('purchase_requests as pr', 'pr.id', '=', 'pri.purchase_request_id')
            ->where('pr.source', 'restock')
            ->whereIn('pr.status', $openStatuses)
            ->whereNotNull('pri.inventory_item_id')
            ->pluck('pri.inventory_item_id')
            ->all();

        $map = [];
        foreach ($ids as $id) {
            $map[(int) $id] = true;
        }

        return $map;
    }

    private function stockStatus(float $stock, float $reorder, ?int $daysLeft): string
    {
        if ($stock <= 0) {
            return 'out_of_stock';
        }
        if ($reorder > 0 && $stock <= $reorder) {
            return 'critical';
        }
        if ($daysLeft !== null && $daysLeft <= 3) {
            return 'low';
        }
        if ($daysLeft !== null && $daysLeft <= 7) {
            return 'warning';
        }

        return 'ok';
    }
}
