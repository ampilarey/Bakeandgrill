<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\OrderItem;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;

/**
 * "Popular now" on the till: what sells most at this hour of the day.
 *
 * Owner, 2026-09-02: "certain items are frequent in certain times". Rather
 * than have somebody maintain time-of-day layouts, this reads the last six
 * weeks of order lines, keeps the ones sold within an hour either side of the
 * current time of day, and ranks items by quantity. Weekdays and weekends are
 * counted apart — a Friday afternoon and a Tuesday afternoon are not the same
 * trade.
 *
 * The result is cached for fifteen minutes per hour-of-day, so a till's
 * five-minute menu refresh costs nothing extra, and it ships inside the menu
 * payload so the tab survives offline.
 */
class PosPopularNowService
{
    public const WEEKS_BACK = 6;
    public const LIMIT = 16;
    /** Hours either side of now that count as "now". */
    private const WINDOW_HOURS = 1;
    private const CACHE_MINUTES = 15;

    /**
     * Item ids, best first, limited to the ids given (the channel's menu).
     *
     * @param list<int> $menuItemIds
     * @return list<int>
     */
    public function rank(array $menuItemIds, ?CarbonImmutable $now = null): array
    {
        $now ??= CarbonImmutable::now();
        $weekend = $now->isWeekend();
        $hour = $now->hour;

        $key = sprintf('pos:popular-now:%s:%d', $weekend ? 'weekend' : 'weekday', $hour);
        /** @var array<int, int> $totals item id => quantity */
        $totals = Cache::remember($key, now()->addMinutes(self::CACHE_MINUTES), fn () => $this->totals($now, $hour, $weekend));

        if ($totals === [] || $menuItemIds === []) {
            return [];
        }

        $onMenu = array_flip(array_map('intval', $menuItemIds));
        $ranked = array_filter($totals, fn (int $qty, int $id) => isset($onMenu[$id]) && $qty > 0, ARRAY_FILTER_USE_BOTH);
        arsort($ranked);

        return array_slice(array_map('intval', array_keys($ranked)), 0, self::LIMIT);
    }

    /**
     * Quantity sold per item in the window, over the look-back. Done in PHP
     * rather than SQL so the hour-of-day arithmetic is the same on MySQL,
     * PostgreSQL and SQLite; the row count is six weeks of order lines,
     * which a café produces in the low thousands.
     *
     * @return array<int, int>
     */
    private function totals(CarbonImmutable $now, int $hour, bool $weekend): array
    {
        $since = $now->subWeeks(self::WEEKS_BACK)->startOfDay();

        $rows = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereNull('order_items.deleted_at')
            ->whereNotNull('order_items.item_id')
            ->where('orders.created_at', '>=', $since)
            ->whereNotIn('orders.status', ['cancelled', 'held'])
            ->get(['order_items.item_id', 'order_items.quantity', 'orders.created_at']);

        $totals = [];
        foreach ($rows as $row) {
            $at = CarbonImmutable::parse((string) $row->created_at);
            if ($at->isWeekend() !== $weekend) {
                continue;
            }
            if (self::hourDistance($at->hour, $hour) > self::WINDOW_HOURS) {
                continue;
            }
            $id = (int) $row->item_id;
            $totals[$id] = ($totals[$id] ?? 0) + max(0, (int) $row->quantity);
        }

        return $totals;
    }

    /** Distance on the 24-hour clock, so 23:30 counts as next to 00:30. */
    private static function hourDistance(int $a, int $b): int
    {
        $d = abs($a - $b);

        return min($d, 24 - $d);
    }
}
