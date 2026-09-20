<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use App\Domains\Reporting\Support\ReportMoneySql;
use App\Models\Item;
use App\Models\OrderItem;
use App\Models\Variant;
use App\Models\WasteLog;
use App\Services\PriceChangesService;
use App\Services\RecipeCostCalculator;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * What each dish makes us, and what we throw away of it.
 *
 * Owner, 2026-09-21, phase C. Recipes carry a cost, purchases carry a
 * price and waste is logged, but nothing joined them: the Product Margins
 * report is price against cost with no volume, no waste and no sense of
 * whether the cost has moved. This is the same dishes over a period —
 * how many sold, what that brought in, what it cost to make at today's
 * prices, what that cost was a month ago, and what was binned.
 */
class MarginWasteService
{
    /** Below this a dish is flagged as thin. */
    public const LOW_MARGIN_PCT = 30.0;

    /** Waste at or above this share of units sold is flagged. */
    public const HIGH_WASTE_PCT = 10.0;

    /** A recipe whose ingredients went up by this much is flagged. */
    public const COST_UP_PCT = 10.0;

    public function __construct(
        private readonly RecipeCostCalculator $costs,
        private readonly PriceChangesService $prices,
    ) {}

    public function report(Carbon $from, Carbon $to): array
    {
        $sold = OrderItem::query()
            ->selectRaw('order_items.item_id, order_items.variant_id, MAX(order_items.item_name) as item_name, MAX(order_items.variant_name) as variant_name, SUM(order_items.quantity) as units, SUM(order_items.total_price) as revenue')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereBetween('orders.created_at', [$from, $to])
            ->whereIn('orders.status', ReportMoneySql::SALE_STATUSES)
            ->where(fn ($q) => $q->whereNull('orders.type')->orWhere('orders.type', '!=', 'gift_card'))
            ->whereNotNull('order_items.item_id')
            ->groupBy('order_items.item_id', 'order_items.variant_id')
            ->get();

        $itemIds = $sold->pluck('item_id')->unique()->values();
        $items = Item::query()
            ->with(['category:id,name', 'recipe.recipeItems.inventoryItem', 'variants'])
            ->whereIn('id', $itemIds)
            ->get()
            ->keyBy('id');

        // Ingredient prices now and a month ago, for "cost went up".
        $priceByIngredient = collect($this->prices->list()['items'])->keyBy('item_id');

        $waste = WasteLog::query()
            ->whereBetween('created_at', [$from, $to])
            ->whereNotNull('item_id')
            ->selectRaw('item_id, SUM(quantity) as qty, SUM(COALESCE(cost_estimate, 0)) as cost')
            ->groupBy('item_id')
            ->get()
            ->keyBy('item_id');
        $ingredientWasteCost = (float) WasteLog::query()
            ->whereBetween('created_at', [$from, $to])
            ->whereNull('item_id')
            ->sum('cost_estimate');

        $rows = [];
        $wasteCounted = [];
        foreach ($sold as $line) {
            /** @var Item|null $item */
            $item = $items->get($line->item_id);
            if ($item === null) {
                continue;
            }
            $variant = $line->variant_id ? $item->variants->firstWhere('id', (int) $line->variant_id) : null;
            $units = round((float) $line->units, 3);
            $revenue = round((float) $line->revenue, 2);
            $unitCost = $this->costs->effectiveCostForVariant($item, $variant instanceof Variant ? $variant : null);
            $cost = $unitCost !== null ? round($unitCost * $units, 2) : null;
            $profit = $cost !== null ? round($revenue - $cost, 2) : null;
            $marginPct = ($cost !== null && $revenue > 0) ? round(($revenue - $cost) / $revenue * 100, 1) : null;
            $costChange = $this->costChangePct($item, $variant instanceof Variant ? $variant : null, $priceByIngredient);

            // Waste is logged per dish, not per size, so it sits on the first
            // row of the dish and is not repeated on its sizes.
            $w = null;
            if (!isset($wasteCounted[$item->id]) && $waste->has($item->id)) {
                $w = $waste->get($item->id);
                $wasteCounted[$item->id] = true;
            }
            $wasteQty = $w ? round((float) $w->qty, 3) : 0.0;
            $wasteCost = $w ? round((float) $w->cost, 2) : 0.0;
            $wastePct = $units > 0 ? round($wasteQty / $units * 100, 1) : null;

            $flags = [];
            if ($marginPct !== null && $marginPct < self::LOW_MARGIN_PCT) {
                $flags[] = 'low_margin';
            }
            if ($wastePct !== null && $wastePct >= self::HIGH_WASTE_PCT) {
                $flags[] = 'high_waste';
            }
            if ($costChange !== null && $costChange >= self::COST_UP_PCT) {
                $flags[] = 'cost_up';
            }

            $rows[] = [
                'item_id' => (int) $item->id,
                'variant_id' => $line->variant_id ? (int) $line->variant_id : null,
                'name' => (string) $item->name . ($variant ? ' — ' . $variant->name : ''),
                'category' => $item->category?->name,
                'units' => $units,
                'revenue' => $revenue,
                'avg_price' => $units > 0 ? round($revenue / $units, 2) : null,
                'unit_cost' => $unitCost !== null ? round($unitCost, 2) : null,
                'cost' => $cost,
                'profit' => $profit,
                'margin_pct' => $marginPct,
                'cost_change_pct' => $costChange,
                'waste_qty' => $wasteQty,
                'waste_cost' => $wasteCost,
                'waste_pct' => $wastePct,
                'flags' => $flags,
            ];
        }

        usort($rows, fn (array $a, array $b) => $b['revenue'] <=> $a['revenue'] ?: strcasecmp($a['name'], $b['name']));

        $revenue = round(array_sum(array_column($rows, 'revenue')), 2);
        $costed = array_filter($rows, fn (array $r) => $r['cost'] !== null);
        $cost = round(array_sum(array_column($costed, 'cost')), 2);
        $costedRevenue = round(array_sum(array_column($costed, 'revenue')), 2);
        $wasteCost = round(array_sum(array_column($rows, 'waste_cost')), 2);

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'thresholds' => ['low_margin_pct' => self::LOW_MARGIN_PCT, 'high_waste_pct' => self::HIGH_WASTE_PCT, 'cost_up_pct' => self::COST_UP_PCT],
            'summary' => [
                'revenue' => $revenue,
                'cost' => $cost,
                'profit' => round($costedRevenue - $cost, 2),
                'margin_pct' => $costedRevenue > 0 ? round(($costedRevenue - $cost) / $costedRevenue * 100, 1) : null,
                'costed_share_pct' => $revenue > 0 ? round($costedRevenue / $revenue * 100, 1) : null,
                'dish_waste_cost' => $wasteCost,
                'ingredient_waste_cost' => round($ingredientWasteCost, 2),
                'low_margin' => count(array_filter($rows, fn (array $r) => in_array('low_margin', $r['flags'], true))),
                'high_waste' => count(array_filter($rows, fn (array $r) => in_array('high_waste', $r['flags'], true))),
                'cost_up' => count(array_filter($rows, fn (array $r) => in_array('cost_up', $r['flags'], true))),
                'dishes' => count($rows),
            ],
            'rows' => $rows,
        ];
    }

    /**
     * How much the recipe's ingredients moved in the last month, weighted by
     * what each contributes to the cost: each row at the ingredient's price
     * a month ago against its price now, from the recorded purchase prices.
     * Null when no ingredient has both prices.
     *
     * @param Collection<int, array<string, mixed>> $priceByIngredient
     */
    private function costChangePct(Item $item, ?Variant $variant, Collection $priceByIngredient): ?float
    {
        $recipe = $item->relationLoaded('recipe') ? $item->recipe : null;
        if ($recipe === null) {
            return null;
        }
        $rows = $recipe->rowsFor($variant);
        $now = 0.0;
        $before = 0.0;
        $known = false;
        foreach ([$rows['shared'], $rows['own']] as $set) {
            foreach ($set as $row) {
                $line = $this->costs->lineCost($row);
                if ($line === null) {
                    continue;
                }
                $p = $priceByIngredient->get((int) $row->inventory_item_id);
                $last = $p['last']['price'] ?? null;
                $month = $p['month_ago']['price'] ?? null;
                if ($last && $month) {
                    $now += $line;
                    $before += $line * ($month / $last);
                    $known = true;
                } else {
                    $now += $line;
                    $before += $line;
                }
            }
        }
        if (!$known || $before <= 0.0) {
            return null;
        }

        return round(($now - $before) / $before * 100, 1);
    }
}
