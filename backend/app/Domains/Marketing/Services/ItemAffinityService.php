<?php

declare(strict_types=1);

namespace App\Domains\Marketing\Services;

use App\Domains\Reporting\Support\ReportMoneySql;
use App\Models\Item;
use App\Models\ItemPairStat;
use App\Models\Order;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class ItemAffinityService
{
    /**
     * Fallback floor when nothing is configured.
     *
     * A pair has to turn up this many times before it is allowed to advise a
     * customer. Lift is a ratio, so a single fluke order — one person who
     * happened to buy a cake and a bottle of water — otherwise scores
     * spectacularly and recommends nonsense with total confidence.
     */
    public const DEFAULT_MIN_PAIR_SUPPORT = 3;

    /**
     * Configurable so a new menu, which will not clear a floor of 3 for weeks,
     * can still make suggestions. See config/marketing.php.
     */
    public static function minPairSupport(): int
    {
        return max(1, (int) config('marketing.min_pair_support', self::DEFAULT_MIN_PAIR_SUPPORT));
    }

    /** @param list<int> $anchorItemIds */
    public function recommendationsForCart(array $anchorItemIds, int $limit = 3): Collection
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $anchorItemIds))));
        if ($ids === []) {
            return collect();
        }

        // MAX rather than SUM across the anchors: summing re-introduces exactly
        // the popularity bias lift exists to remove, because an item loosely
        // related to all five things in a basket would out-score the one item
        // that genuinely belongs with any of them.
        $rows = ItemPairStat::query()
            ->select(
                'paired_item_id',
                DB::raw('MAX(lift) as score'),
                DB::raw('SUM(pair_count) as together'),
            )
            ->whereIn('item_id', $ids)
            ->whereNotIn('paired_item_id', $ids)
            ->where('pair_count', '>=', self::minPairSupport())
            ->groupBy('paired_item_id')
            ->orderByDesc('score')
            ->orderByDesc('together')
            // Over-fetch: some winners will be inactive or sold out and get
            // dropped below, and returning two suggestions when three exist
            // looks like a bug.
            ->limit(max($limit * 4, $limit))
            ->get();

        if ($rows->isEmpty()) {
            return collect();
        }

        // One query for the lot. This used to run a SELECT per row.
        $items = Item::query()
            ->whereIn('id', $rows->pluck('paired_item_id')->all())
            ->where('is_active', true)
            ->where('is_available', true)
            ->get()
            ->keyBy('id');

        return $rows
            ->map(function ($row) use ($items) {
                $item = $items->get((int) $row->paired_item_id);
                if ($item === null) {
                    return null;
                }

                return [
                    'id' => $item->id,
                    'name' => $item->name,
                    'name_dv' => $item->name_dv,
                    'base_price' => $item->base_price,
                    'image_url' => $item->display_image_url,
                    'is_available' => $item->is_available,
                    'has_variants' => $item->has_variants,
                    'pair_count' => (int) $row->together,
                    'lift' => round((float) $row->score, 2),
                ];
            })
            ->filter()
            ->take($limit)
            ->values();
    }

    public function recompute(int $lookbackDays = 90): int
    {
        $since = now()->subDays(max(1, $lookbackDays));
        $computedAt = now();

        // ReportMoneySql::SALE_STATUSES is the project's one definition of "a
        // sale that counts", and every money report already uses it. This used
        // to carry its own narrower list of paid/completed, which silently
        // excluded every delivery order that stops at `delivered` — there is no
        // job that auto-completes those — so the recommendations were built on
        // a different history than the revenue figures they sit beside.
        $orderIds = Order::query()
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->where('created_at', '>=', $since)
            ->pluck('id');

        if ($orderIds->isEmpty()) {
            ItemPairStat::query()->delete();

            return 0;
        }

        // Money per (order, item) so a pair can carry what it actually took,
        // rather than the whole basket it happened to travel in.
        $rows = DB::table('order_items')
            ->select('order_id', 'item_id', DB::raw('SUM(total_price) as line_total'))
            ->whereIn('order_id', $orderIds)
            ->whereNull('deleted_at')
            ->whereNotNull('item_id')
            ->groupBy('order_id', 'item_id')
            ->get()
            ->groupBy('order_id');

        /** @var array<string, array{count: int, revenue: float}> $pairs key "a:b" where a < b */
        $pairs = [];
        /** @var array<int, int> $itemOrders orders containing each item */
        $itemOrders = [];
        $totalOrders = 0;

        foreach ($rows as $orderItems) {
            $revenueByItem = [];
            foreach ($orderItems as $line) {
                $itemId = (int) $line->item_id;
                $revenueByItem[$itemId] = ($revenueByItem[$itemId] ?? 0.0) + (float) $line->line_total;
            }

            $itemIds = array_keys($revenueByItem);
            if ($itemIds === []) {
                continue;
            }

            // Counted even for a single-item order: it is part of the window,
            // and support(B) is wrong if the denominator only sees baskets.
            $totalOrders++;
            foreach ($itemIds as $itemId) {
                $itemOrders[$itemId] = ($itemOrders[$itemId] ?? 0) + 1;
            }

            $n = count($itemIds);
            for ($i = 0; $i < $n; $i++) {
                for ($j = $i + 1; $j < $n; $j++) {
                    $a = min($itemIds[$i], $itemIds[$j]);
                    $b = max($itemIds[$i], $itemIds[$j]);
                    if ($a === $b) {
                        continue;
                    }
                    $key = $a . ':' . $b;
                    if (!isset($pairs[$key])) {
                        $pairs[$key] = ['count' => 0, 'revenue' => 0.0];
                    }
                    $pairs[$key]['count']++;
                    $pairs[$key]['revenue'] += $revenueByItem[$a] + $revenueByItem[$b];
                }
            }
        }

        $records = [];
        $now = $computedAt->toDateTimeString();

        foreach ($pairs as $key => $stat) {
            [$a, $b] = array_map('intval', explode(':', $key));
            $aOrders = $itemOrders[$a] ?? 0;
            $bOrders = $itemOrders[$b] ?? 0;

            // Directed both ways: confidence and lift differ by direction, and
            // the cart panel only ever looks up rows by item_id.
            $records[] = $this->pairRow($a, $b, $stat, $aOrders, $bOrders, $totalOrders, $now);
            $records[] = $this->pairRow($b, $a, $stat, $bOrders, $aOrders, $totalOrders, $now);
        }

        DB::transaction(function () use ($records): void {
            ItemPairStat::query()->delete();

            // Chunked bulk insert. This used to be one Eloquent create() per
            // directed row, which on a real menu is tens of thousands of
            // individual INSERTs inside a single transaction.
            foreach (array_chunk($records, 500) as $chunk) {
                DB::table('item_pair_stats')->insert($chunk);
            }
        });

        return count($records);
    }

    /**
     * @param  array{count: int, revenue: float}  $stat
     * @return array<string, mixed>
     */
    private function pairRow(
        int $anchorId,
        int $pairedId,
        array $stat,
        int $anchorOrders,
        int $pairedOrders,
        int $totalOrders,
        string $now,
    ): array {
        // confidence(A→B): of the orders holding A, the share that also held B.
        $confidence = $anchorOrders > 0 ? $stat['count'] / $anchorOrders : 0.0;
        // lift: that share against B's own baseline. 1.0 means "no relationship
        // beyond B being popular"; above 1 is a real association.
        $support = $totalOrders > 0 ? $pairedOrders / $totalOrders : 0.0;
        $lift = $support > 0 ? $confidence / $support : 0.0;

        return [
            'item_id' => $anchorId,
            'paired_item_id' => $pairedId,
            'pair_count' => $stat['count'],
            'anchor_orders' => $anchorOrders,
            'paired_orders' => $pairedOrders,
            'total_orders' => $totalOrders,
            'pair_revenue' => round($stat['revenue'], 2),
            // Column widths: confidence is a share (0–1), lift is unbounded in
            // principle but decimal(10,4) caps at 999999.9999.
            'confidence' => round(min($confidence, 1.0), 4),
            'lift' => round(min($lift, 999999.9999), 4),
            'computed_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ];
    }
}
