<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Item;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Per-item, per-collection-date cap for collect-tomorrow orders.
 * Null capacity = unlimited. Counts standing orders only (not cancelled/refunded).
 */
class TomorrowDailyCapacityService
{
    /** Order statuses that no longer consume kitchen capacity. */
    public const EXCLUDED_STATUSES = ['cancelled', 'refunded'];

    /**
     * Sum quantity already committed for an item on a collection date.
     * Call inside a transaction after locking the item row.
     */
    public function committedQuantity(int $itemId, string $fulfilDate, ?int $excludeOrderId = null): float
    {
        $query = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('order_items.item_id', $itemId)
            ->whereDate('orders.fulfil_date', $fulfilDate)
            ->whereNotIn('orders.status', self::EXCLUDED_STATUSES);

        if ($excludeOrderId !== null) {
            $query->where('orders.id', '!=', $excludeOrderId);
        }

        return (float) $query->sum('order_items.quantity');
    }

    /**
     * Remaining units for public menu (null = unlimited / no cap configured).
     *
     * @param  Collection<int, Item>|iterable<Item>  $items
     * @return array<int, int|null> item_id => remaining
     */
    public function remainingMap(iterable $items, string $fulfilDate): array
    {
        $capped = [];
        foreach ($items as $item) {
            if ($item instanceof Item && $item->tomorrow_daily_capacity !== null) {
                $capped[(int) $item->id] = (int) $item->tomorrow_daily_capacity;
            }
        }

        if ($capped === []) {
            return [];
        }

        $committedRows = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('order_items.item_id', array_keys($capped))
            ->whereDate('orders.fulfil_date', $fulfilDate)
            ->whereNotIn('orders.status', self::EXCLUDED_STATUSES)
            ->groupBy('order_items.item_id')
            ->selectRaw('order_items.item_id, SUM(order_items.quantity) as qty')
            ->pluck('qty', 'item_id');

        $map = [];
        foreach ($capped as $itemId => $capacity) {
            $committed = (float) ($committedRows[$itemId] ?? 0);
            $map[$itemId] = max(0, $capacity - (int) floor($committed));
        }

        return $map;
    }

    /**
     * Lock the item row, re-read capacity, and reject if the request would exceed
     * the per-date total. Must run inside the same DB::transaction as order insert.
     *
     * @param  float  $alreadyQueuedInThisOrder  qty of this item already accepted earlier in the same payload
     */
    public function assertCanAllocate(
        Item $item,
        string $fulfilDate,
        float $requestedQty,
        ?int $excludeOrderId = null,
        float $alreadyQueuedInThisOrder = 0.0,
    ): Item {
        $locked = Item::query()->whereKey($item->id)->lockForUpdate()->first() ?? $item;
        $capacity = $locked->tomorrow_daily_capacity;
        if ($capacity === null) {
            return $locked;
        }

        $committed = $this->committedQuantity((int) $locked->id, $fulfilDate, $excludeOrderId);
        $remaining = max(0, (int) $capacity - (int) floor($committed) - (int) floor($alreadyQueuedInThisOrder));

        if ($requestedQty > $remaining) {
            throw new HttpException(
                422,
                "Only {$remaining} left for collection tomorrow",
            );
        }

        return $locked;
    }
}
