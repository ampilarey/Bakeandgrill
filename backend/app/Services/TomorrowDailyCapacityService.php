<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Item;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Per-item, per-day cap: "Most you can make in a day".
 *
 * Null capacity = unlimited. Counts standing orders only (not cancelled or
 * refunded).
 *
 * Until 2026-09-21 this counted collect-tomorrow orders alone, so a dish
 * capped at ten a day could still be ordered fifty times for today, and an
 * event on Friday never counted against Friday. Owner: "catering does not
 * require stock, but there might be a limit to order." One number now covers
 * every day the kitchen is asked for the dish:
 *
 *  - an order with a fulfil_date counts on that date;
 *  - a same-day order (no fulfil_date) counts on the day it was placed;
 *  - an event request counts on its event date, from the moment it is
 *    submitted, so two customers cannot both book the last twenty.
 *
 * A confirmed event's order carries no fulfil_date and is typed `catering`,
 * so it is left out of the same-day count: its request already counts.
 */
class TomorrowDailyCapacityService
{
    /** Order statuses that no longer consume kitchen capacity. */
    public const EXCLUDED_STATUSES = ['cancelled', 'refunded'];

    /** Event request statuses that no longer hold their date. */
    public const EXCLUDED_EVENT_STATUSES = ['cancelled'];

    /**
     * Sum quantity already committed for an item on a date.
     * Call inside a transaction after locking the item row.
     */
    public function committedQuantity(int $itemId, string $date, ?int $excludeOrderId = null): float
    {
        $orders = $this->orderLines([$itemId], $date, $excludeOrderId)->sum('order_items.quantity');
        $events = $this->eventLines([$itemId], $date)->sum('catering_request_lines.quantity');

        return (float) $orders + (float) $events;
    }

    /**
     * Remaining units for public menu (null = unlimited / no cap configured).
     *
     * @param Collection<int, Item>|iterable<Item> $items
     * @return array<int, int|null> item_id => remaining
     */
    public function remainingMap(iterable $items, string $date): array
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

        $ids = array_keys($capped);
        $committed = $this->orderLines($ids, $date)
            ->groupBy('order_items.item_id')
            ->selectRaw('order_items.item_id as item_id, SUM(order_items.quantity) as qty')
            ->pluck('qty', 'item_id')
            ->map(fn ($qty) => (float) $qty)
            ->all();
        $eventRows = $this->eventLines($ids, $date)
            ->groupBy('catering_request_lines.item_id')
            ->selectRaw('catering_request_lines.item_id as item_id, SUM(catering_request_lines.quantity) as qty')
            ->pluck('qty', 'item_id');
        foreach ($eventRows as $itemId => $qty) {
            $committed[(int) $itemId] = ($committed[(int) $itemId] ?? 0.0) + (float) $qty;
        }

        $map = [];
        foreach ($capped as $itemId => $capacity) {
            $map[$itemId] = max(0, $capacity - (int) floor($committed[$itemId] ?? 0.0));
        }

        return $map;
    }

    /**
     * Lock the item row, re-read capacity, and reject if the request would exceed
     * the per-date total. Must run inside the same DB::transaction as order insert.
     *
     * @param float $alreadyQueuedInThisOrder qty of this item already accepted earlier in the same payload
     */
    public function assertCanAllocate(
        Item $item,
        string $date,
        float $requestedQty,
        ?int $excludeOrderId = null,
        float $alreadyQueuedInThisOrder = 0.0,
    ): Item {
        $locked = Item::query()->whereKey($item->id)->lockForUpdate()->first() ?? $item;
        $capacity = $locked->tomorrow_daily_capacity;
        if ($capacity === null) {
            return $locked;
        }

        $committed = $this->committedQuantity((int) $locked->id, $date, $excludeOrderId);
        $remaining = max(0, (int) $capacity - (int) floor($committed) - (int) floor($alreadyQueuedInThisOrder));

        if ($requestedQty > $remaining) {
            throw new HttpException(422, $this->onlyLeftMessage($remaining, $date));
        }

        return $locked;
    }

    /** "Only 2 left for collection tomorrow" / "for today" / "for 3 Oct". */
    public function onlyLeftMessage(int $remaining, string $date): string
    {
        return "Only {$remaining} left for {$this->dateLabel($date)}";
    }

    public function dateLabel(string $date): string
    {
        $day = Carbon::parse($date, config('app.timezone'));
        if ($day->isToday()) {
            return 'today';
        }
        if ($day->isTomorrow()) {
            return 'collection tomorrow';
        }

        return $day->format('j M');
    }

    /**
     * @param list<int> $itemIds
     */
    private function orderLines(array $itemIds, string $date, ?int $excludeOrderId = null): \Illuminate\Database\Query\Builder
    {
        $query = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('order_items.item_id', $itemIds)
            ->whereNotIn('orders.status', self::EXCLUDED_STATUSES)
            ->where(function ($q) use ($date) {
                $q->whereDate('orders.fulfil_date', $date)
                    ->orWhere(function ($sameDay) use ($date) {
                        $sameDay->whereNull('orders.fulfil_date')
                            ->where('orders.type', '!=', 'catering')
                            ->whereDate('orders.created_at', $date);
                    });
            });

        if ($excludeOrderId !== null) {
            $query->where('orders.id', '!=', $excludeOrderId);
        }

        return $query;
    }

    /**
     * @param list<int> $itemIds
     */
    private function eventLines(array $itemIds, string $date): \Illuminate\Database\Query\Builder
    {
        return DB::table('catering_request_lines')
            ->join('catering_requests', 'catering_requests.id', '=', 'catering_request_lines.catering_request_id')
            ->whereIn('catering_request_lines.item_id', $itemIds)
            ->whereDate('catering_requests.event_date', $date)
            ->whereNotIn('catering_requests.status', self::EXCLUDED_EVENT_STATUSES);
    }
}
