<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\InventoryItem;
use App\Models\SupplierPriceHistory;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * What each thing we buy costs now against what it cost before.
 *
 * Owner, 2026-09-19: "Where i can see the price difference of each product
 * over time. An easy way to". The prices were all recorded — every receipt
 * writes a supplier_price_history row — but the only views were a per-item
 * table behind an icon and a top-eight trend chart. This reads the same
 * rows and answers the question directly: last price, the one before, the
 * one a month ago, and the change, for every item, biggest rise first.
 */
class PriceChangesService
{
    /** How far back the sparkline and the "a month ago" reference reach. */
    public const WINDOW_DAYS = 365;

    public const SPARK_DAYS = 90;

    public const MONTH_DAYS = 30;

    /**
     * @return array{
     *   items: list<array<string, mixed>>,
     *   summary: array{items: int, up_over_10: int, up: int, down: int, unchanged: int, single_price: int}
     * }
     */
    public function list(): array
    {
        $today = Carbon::today();
        $since = $today->copy()->subDays(self::WINDOW_DAYS)->toDateString();
        $monthAgo = $today->copy()->subDays(self::MONTH_DAYS)->toDateString();
        $sparkFrom = $today->copy()->subDays(self::SPARK_DAYS)->toDateString();

        $rows = SupplierPriceHistory::query()
            ->where('recorded_at', '>=', $since)
            ->orderBy('inventory_item_id')
            ->orderBy('recorded_at')
            ->orderBy('id')
            ->limit(50000)
            ->get(['inventory_item_id', 'supplier_id', 'purchase_id', 'unit_price', 'recorded_at', 'brand']);

        if ($rows->isEmpty()) {
            return ['items' => [], 'summary' => $this->summary([])];
        }

        $items = InventoryItem::query()
            ->whereIn('id', $rows->pluck('inventory_item_id')->unique())
            ->get(['id', 'name', 'unit', 'photo_path', 'is_active'])
            ->keyBy('id');
        $supplierNames = \App\Models\Supplier::query()
            ->whereIn('id', $rows->pluck('supplier_id')->unique())
            ->pluck('name', 'id');

        $out = [];
        foreach ($rows->groupBy('inventory_item_id') as $itemId => $points) {
            $item = $items->get($itemId);
            if ($item === null || !$item->is_active) {
                continue;
            }

            /** @var Collection<int, SupplierPriceHistory> $points */
            $last = $points->last();
            $lastDate = $last->recorded_at->toDateString();

            // "The one before": the latest price from a different purchase
            // than the last one, so two lines of one delivery do not count
            // as a change.
            $previous = $points->reverse()->first(fn (SupplierPriceHistory $p) => $p->purchase_id !== $last->purchase_id
                || $p->recorded_at->toDateString() !== $lastDate);
            $monthRef = $points->reverse()->first(fn (SupplierPriceHistory $p) => $p->recorded_at->toDateString() <= $monthAgo);

            $spark = $points
                ->filter(fn (SupplierPriceHistory $p) => $p->recorded_at->toDateString() >= $sparkFrom)
                ->groupBy(fn (SupplierPriceHistory $p) => $p->recorded_at->toDateString())
                ->map(fn (Collection $day, string $date) => ['date' => $date, 'price' => round((float) $day->avg('unit_price'), 4)])
                ->values()
                ->all();

            $out[] = [
                'item_id' => (int) $item->id,
                'name' => $item->name,
                'unit' => $item->unit,
                'photo_url' => $item->photo_url,
                'last' => $this->point($last, $supplierNames),
                'previous' => $previous ? $this->point($previous, $supplierNames) : null,
                'month_ago' => $monthRef ? $this->point($monthRef, $supplierNames) : null,
                'change_pct' => $previous ? self::pct((float) $previous->unit_price, (float) $last->unit_price) : null,
                'change_pct_month' => $monthRef ? self::pct((float) $monthRef->unit_price, (float) $last->unit_price) : null,
                'purchases_90d' => $points->filter(fn (SupplierPriceHistory $p) => $p->recorded_at->toDateString() >= $sparkFrom)->count(),
                'sparkline' => $spark,
            ];
        }

        // Biggest rise first; items with only one price ever go last, by name.
        usort($out, function (array $a, array $b) {
            $ca = $a['change_pct'];
            $cb = $b['change_pct'];
            if ($ca === null && $cb === null) {
                return strcasecmp($a['name'], $b['name']);
            }
            if ($ca === null) {
                return 1;
            }
            if ($cb === null) {
                return -1;
            }
            if ($ca === $cb) {
                return strcasecmp($a['name'], $b['name']);
            }

            return $cb <=> $ca;
        });

        return ['items' => $out, 'summary' => $this->summary($out)];
    }

    /**
     * Every recorded price for one item, oldest first, with who charged it.
     *
     * @return array{item: array<string, mixed>|null, points: list<array<string, mixed>>}
     */
    public function history(int $itemId): array
    {
        $item = InventoryItem::query()->find($itemId, ['id', 'name', 'unit', 'photo_path']);
        if ($item === null) {
            return ['item' => null, 'points' => []];
        }

        $rows = SupplierPriceHistory::query()
            ->with(['supplier:id,name', 'purchase:id,purchase_number'])
            ->where('inventory_item_id', $itemId)
            ->orderByDesc('recorded_at')
            ->orderByDesc('id')
            ->limit(200)
            ->get()
            ->reverse()
            ->values();

        return [
            'item' => ['id' => (int) $item->id, 'name' => $item->name, 'unit' => $item->unit, 'photo_url' => $item->photo_url],
            'points' => $rows->map(fn (SupplierPriceHistory $p) => [
                'date' => $p->recorded_at->toDateString(),
                'price' => round((float) $p->unit_price, 4),
                'supplier' => $p->supplier?->name,
                'brand' => $p->brand,
                'purchase_id' => $p->purchase_id,
                'purchase_number' => $p->purchase?->purchase_number,
            ])->all(),
        ];
    }

    /** @param Collection<int, string> $supplierNames */
    private function point(SupplierPriceHistory $p, Collection $supplierNames): array
    {
        return [
            'price' => round((float) $p->unit_price, 4),
            'date' => $p->recorded_at->toDateString(),
            'supplier' => $supplierNames->get($p->supplier_id),
            'brand' => $p->brand,
        ];
    }

    public static function pct(float $from, float $to): ?float
    {
        if ($from <= 0.0) {
            return null;
        }

        return round(($to - $from) / $from * 100, 1);
    }

    /**
     * @param list<array<string, mixed>> $items
     * @return array{items: int, up_over_10: int, up: int, down: int, unchanged: int, single_price: int}
     */
    private function summary(array $items): array
    {
        $s = ['items' => count($items), 'up_over_10' => 0, 'up' => 0, 'down' => 0, 'unchanged' => 0, 'single_price' => 0];
        foreach ($items as $i) {
            $c = $i['change_pct'];
            if ($c === null) {
                $s['single_price']++;
            } elseif ($c >= 10) {
                $s['up_over_10']++;
                $s['up']++;
            } elseif ($c > 0) {
                $s['up']++;
            } elseif ($c < 0) {
                $s['down']++;
            } else {
                $s['unchanged']++;
            }
        }

        return $s;
    }
}
