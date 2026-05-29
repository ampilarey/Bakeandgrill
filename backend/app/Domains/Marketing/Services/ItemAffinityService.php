<?php

declare(strict_types=1);

namespace App\Domains\Marketing\Services;

use App\Models\Item;
use App\Models\ItemPairStat;
use App\Models\Order;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class ItemAffinityService
{
    /** @param list<int> $anchorItemIds */
    public function recommendationsForCart(array $anchorItemIds, int $limit = 3): Collection
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $anchorItemIds))));
        if ($ids === []) {
            return collect();
        }

        $exclude = $ids;

        return ItemPairStat::query()
            ->select('paired_item_id', DB::raw('SUM(pair_count) as score'))
            ->whereIn('item_id', $ids)
            ->whereNotIn('paired_item_id', $exclude)
            ->groupBy('paired_item_id')
            ->orderByDesc('score')
            ->limit($limit)
            ->get()
            ->map(function ($row) {
                $item = Item::query()
                    ->where('id', $row->paired_item_id)
                    ->where('is_active', true)
                    ->where('is_available', true)
                    ->first();

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
                    'pair_count' => (int) $row->score,
                ];
            })
            ->filter()
            ->values();
    }

    public function recompute(int $lookbackDays = 90): int
    {
        $since = now()->subDays(max(1, $lookbackDays));
        $computedAt = now();

        $orderIds = Order::query()
            ->whereIn('status', ['paid', 'completed'])
            ->where('created_at', '>=', $since)
            ->pluck('id');

        if ($orderIds->isEmpty()) {
            ItemPairStat::query()->delete();

            return 0;
        }

        $rows = DB::table('order_items')
            ->select('order_id', 'item_id')
            ->whereIn('order_id', $orderIds)
            ->whereNull('deleted_at')
            ->whereNotNull('item_id')
            ->distinct()
            ->get()
            ->groupBy('order_id');

        /** @var array<string, int> $counts key "a:b" where a < b */
        $counts = [];

        foreach ($rows as $orderItems) {
            $itemIds = $orderItems->pluck('item_id')->unique()->values()->all();
            $n = count($itemIds);
            for ($i = 0; $i < $n; $i++) {
                for ($j = $i + 1; $j < $n; $j++) {
                    $a = (int) min($itemIds[$i], $itemIds[$j]);
                    $b = (int) max($itemIds[$i], $itemIds[$j]);
                    if ($a === $b) {
                        continue;
                    }
                    $key = $a . ':' . $b;
                    $counts[$key] = ($counts[$key] ?? 0) + 1;
                }
            }
        }

        DB::transaction(function () use ($counts, $computedAt): void {
            ItemPairStat::query()->delete();

            foreach ($counts as $key => $count) {
                [$a, $b] = array_map('intval', explode(':', $key));
                ItemPairStat::create([
                    'item_id' => $a,
                    'paired_item_id' => $b,
                    'pair_count' => $count,
                    'computed_at' => $computedAt,
                ]);
                ItemPairStat::create([
                    'item_id' => $b,
                    'paired_item_id' => $a,
                    'pair_count' => $count,
                    'computed_at' => $computedAt,
                ]);
            }
        });

        return count($counts) * 2;
    }
}
