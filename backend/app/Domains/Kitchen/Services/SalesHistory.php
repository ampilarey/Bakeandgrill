<?php

declare(strict_types=1);

namespace App\Domains\Kitchen\Services;

use App\Domains\Kitchen\Support\PlanSlots;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The plan's reads. Everything comes back keyed "item_id:variant_id" with
 * 0 for "the item itself", bucketed into trading days and time slots.
 *
 * Timestamps in the database are in the app's own timezone, so an hour
 * pulled out of created_at is already the local hour.
 */
final class SalesHistory
{
    /**
     * Completed sales per item and size, per trading day and slot.
     *
     * @return array{
     *   items: array<string, array<string, array<string, array{qty: float, registered: float, orders: int}>>>,
     *   days: array<string, float>
     * }
     */
    public function slotSales(string $fromDate, string $toDate, PlanSlots $slots): array
    {
        [$start, $end] = $this->tradingRange($fromDate, $toDate, $slots);
        $bucket = self::hourBucketExpr('orders.created_at');

        $rows = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.status', 'completed')
            ->whereNull('orders.deleted_at')
            ->where('orders.created_at', '>=', $start)
            ->where('orders.created_at', '<', $end)
            ->whereNotNull('order_items.item_id')
            ->selectRaw(
                "order_items.item_id, order_items.variant_id, {$bucket} as hb, "
                . 'SUM(order_items.quantity) as qty, '
                . 'SUM(CASE WHEN orders.customer_id IS NULL THEN 0 ELSE order_items.quantity END) as reg_qty, '
                . 'COUNT(DISTINCT orders.id) as orders',
            )
            ->groupBy('order_items.item_id', 'order_items.variant_id', 'hb')
            ->get();

        $items = [];
        $days = [];
        foreach ($rows as $row) {
            [$date, $slotKey] = $this->place((string) $row->hb, $slots);
            if ($slotKey === null) {
                continue;
            }
            $key = self::key((int) $row->item_id, (int) ($row->variant_id ?? 0));
            $qty = (float) $row->qty;

            $cell = $items[$key][$date][$slotKey] ?? ['qty' => 0.0, 'registered' => 0.0, 'orders' => 0];
            $cell['qty'] += $qty;
            $cell['registered'] += (float) $row->reg_qty;
            $cell['orders'] += (int) $row->orders;
            $items[$key][$date][$slotKey] = $cell;

            $days[$date] = ($days[$date] ?? 0.0) + $qty;
        }

        return ['items' => $items, 'days' => $days];
    }

    /**
     * Whole orders per trading day and slot, split registered / walk-in.
     *
     * @return array<string, array<string, array{orders: int, registered_orders: int, revenue: float, registered_revenue: float}>>
     */
    public function orderTraffic(string $fromDate, string $toDate, PlanSlots $slots): array
    {
        [$start, $end] = $this->tradingRange($fromDate, $toDate, $slots);
        $bucket = self::hourBucketExpr('orders.created_at');

        $rows = DB::table('orders')
            ->where('status', 'completed')
            ->whereNull('deleted_at')
            ->where('created_at', '>=', $start)
            ->where('created_at', '<', $end)
            ->selectRaw(
                "{$bucket} as hb, COUNT(*) as orders, SUM(total) as revenue, "
                . 'SUM(CASE WHEN customer_id IS NULL THEN 0 ELSE 1 END) as reg_orders, '
                . 'SUM(CASE WHEN customer_id IS NULL THEN 0 ELSE total END) as reg_revenue',
            )
            ->groupBy('hb')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            [$date, $slotKey] = $this->place((string) $row->hb, $slots);
            if ($slotKey === null) {
                continue;
            }
            $cell = $out[$date][$slotKey] ?? ['orders' => 0, 'registered_orders' => 0, 'revenue' => 0.0, 'registered_revenue' => 0.0];
            $cell['orders'] += (int) $row->orders;
            $cell['registered_orders'] += (int) $row->reg_orders;
            $cell['revenue'] += (float) $row->revenue;
            $cell['registered_revenue'] += (float) $row->reg_revenue;
            $out[$date][$slotKey] = $cell;
        }

        return $out;
    }

    /**
     * What each registered customer bought of each item, per trading day.
     *
     * @return array<string, array<int, array<string, float>>> key → customer id → date → qty
     */
    public function customerDailyRows(string $fromDate, string $toDate, PlanSlots $slots): array
    {
        [$start, $end] = $this->tradingRange($fromDate, $toDate, $slots);
        $bucket = self::hourBucketExpr('orders.created_at');

        $rows = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.status', 'completed')
            ->whereNull('orders.deleted_at')
            ->whereNotNull('orders.customer_id')
            ->where('orders.created_at', '>=', $start)
            ->where('orders.created_at', '<', $end)
            ->whereNotNull('order_items.item_id')
            ->selectRaw("order_items.item_id, order_items.variant_id, orders.customer_id, {$bucket} as hb, SUM(order_items.quantity) as qty")
            ->groupBy('order_items.item_id', 'order_items.variant_id', 'orders.customer_id', 'hb')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            [$date] = $this->place((string) $row->hb, $slots);
            $key = self::key((int) $row->item_id, (int) ($row->variant_id ?? 0));
            $cid = (int) $row->customer_id;
            $out[$key][$cid][$date] = ($out[$key][$cid][$date] ?? 0.0) + (float) $row->qty;
        }

        return $out;
    }

    /**
     * Stretches during which an item could not be sold, so a quiet slot can
     * be told apart from a sold-out one. Two witnesses:
     *
     *   - the audit trail of KDS "86" and admin snoozes;
     *   - prepared stock hitting zero (a `sale` movement against a menu
     *     item that leaves nothing behind) until something is made again.
     *
     * @return array<int, list<array{start: Carbon, end: Carbon|null, source: string}>> item id → intervals
     */
    public function selloutIntervals(string $fromDate, string $toDate): array
    {
        $tz = config('app.timezone');
        $start = Carbon::parse($fromDate, $tz)->startOfDay();
        $end = Carbon::parse($toDate, $tz)->addDay()->startOfDay();

        $out = [];

        $logs = DB::table('audit_logs')
            ->where('model_type', 'Item')
            ->whereIn('action', ['item.86', 'item.un86', 'item.snoozed', 'item.restored'])
            ->where('created_at', '>=', $start)
            ->where('created_at', '<', $end)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['model_id', 'action', 'new_values', 'created_at']);

        $open = [];
        foreach ($logs as $log) {
            $itemId = (int) $log->model_id;
            $at = Carbon::parse((string) $log->created_at, $tz);
            if (in_array($log->action, ['item.86', 'item.snoozed'], true)) {
                if (isset($open[$itemId])) {
                    continue;
                }
                $until = null;
                if ($log->action === 'item.snoozed') {
                    $values = is_string($log->new_values) ? json_decode($log->new_values, true) : null;
                    $raw = is_array($values) ? ($values['snoozed_until'] ?? null) : null;
                    $until = is_string($raw) && $raw !== '' ? Carbon::parse($raw)->setTimezone($tz) : null;
                }
                $open[$itemId] = ['start' => $at, 'until' => $until];

                continue;
            }
            if (isset($open[$itemId])) {
                $out[$itemId][] = ['start' => $open[$itemId]['start'], 'end' => $at, 'source' => 'menu'];
                unset($open[$itemId]);
            }
        }
        foreach ($open as $itemId => $interval) {
            $out[$itemId][] = ['start' => $interval['start'], 'end' => $interval['until'], 'source' => 'menu'];
        }

        $moves = DB::table('stock_movements')
            ->where('reference_type', 'menu_item')
            ->where('created_at', '>=', $start)
            ->where('created_at', '<', $end)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get(['reference_id', 'balance_after', 'created_at']);

        $empty = [];
        foreach ($moves as $move) {
            $itemId = (int) $move->reference_id;
            $at = Carbon::parse((string) $move->created_at, $tz);
            if ((float) $move->balance_after <= 0) {
                $empty[$itemId] ??= $at;
            } elseif (isset($empty[$itemId])) {
                $out[$itemId][] = ['start' => $empty[$itemId], 'end' => $at, 'source' => 'stock'];
                unset($empty[$itemId]);
            }
        }
        foreach ($empty as $itemId => $at) {
            $out[$itemId][] = ['start' => $at, 'end' => null, 'source' => 'stock'];
        }

        return $out;
    }

    /**
     * Demand for a day that is already on the books: orders placed for
     * collection that day, and approved pre-orders.
     *
     * @return array<string, array{day: float, slots: array<string, float>}>
     */
    public function knownDemand(string $date, PlanSlots $slots): array
    {
        $out = [];
        $add = function (int $itemId, int $variantId, float $qty, ?string $slotKey) use (&$out): void {
            $key = self::key($itemId, $variantId);
            $out[$key] ??= ['day' => 0.0, 'slots' => []];
            $out[$key]['day'] += $qty;
            if ($slotKey !== null) {
                $out[$key]['slots'][$slotKey] = ($out[$key]['slots'][$slotKey] ?? 0.0) + $qty;
            }
        };

        $rows = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereDate('orders.fulfil_date', $date)
            ->whereNull('orders.deleted_at')
            ->whereNotIn('orders.status', ['cancelled', 'refunded'])
            ->whereNotNull('order_items.item_id')
            ->get(['order_items.item_id', 'order_items.variant_id', 'order_items.quantity', 'orders.pickup_slot_at']);

        foreach ($rows as $row) {
            $slotKey = null;
            if ($row->pickup_slot_at) {
                $slotKey = $slots->keyForHour(Carbon::parse((string) $row->pickup_slot_at, config('app.timezone'))->hour);
            }
            $add((int) $row->item_id, (int) ($row->variant_id ?? 0), (float) $row->quantity, $slotKey);
        }

        $tz = config('app.timezone');
        $dayStart = Carbon::parse($date, $tz)->startOfDay();
        $pre = DB::table('pre_orders')
            ->whereIn('status', ['approved', 'confirmed', 'preparing'])
            ->where('fulfillment_date', '>=', $dayStart)
            ->where('fulfillment_date', '<', $dayStart->copy()->addDay())
            ->get(['items', 'fulfillment_date']);

        foreach ($pre as $order) {
            $lines = is_string($order->items) ? json_decode($order->items, true) : null;
            if (!is_array($lines)) {
                continue;
            }
            $slotKey = $slots->keyForHour(Carbon::parse((string) $order->fulfillment_date, $tz)->hour);
            foreach ($lines as $line) {
                $itemId = (int) ($line['item_id'] ?? 0);
                if ($itemId <= 0) {
                    continue;
                }
                $add($itemId, (int) ($line['variant_id'] ?? 0), (float) ($line['quantity'] ?? 0), $slotKey);
            }
        }

        return $out;
    }

    /**
     * What the kitchen has already produced on a day, from its batches.
     *
     * @return array<string, float>
     */
    public function madeOn(string $date): array
    {
        $tz = config('app.timezone');
        $start = Carbon::parse($date, $tz)->startOfDay();

        $rows = DB::table('kitchen_production_items')
            ->join('kitchen_production_batches', 'kitchen_production_batches.id', '=', 'kitchen_production_items.kitchen_production_batch_id')
            ->where('kitchen_production_batches.status', '!=', 'cancelled')
            ->where('kitchen_production_batches.created_at', '>=', $start)
            ->where('kitchen_production_batches.created_at', '<', $start->copy()->addDay())
            ->whereNotNull('kitchen_production_items.item_id')
            ->selectRaw('kitchen_production_items.item_id, kitchen_production_items.variant_id, SUM(kitchen_production_items.produced_qty) as qty')
            ->groupBy('kitchen_production_items.item_id', 'kitchen_production_items.variant_id')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $out[self::key((int) $row->item_id, (int) ($row->variant_id ?? 0))] = (float) $row->qty;
        }

        return $out;
    }

    public static function key(int $itemId, int $variantId): string
    {
        return $itemId . ':' . $variantId;
    }

    /** @return array{0: int, 1: int} */
    public static function splitKey(string $key): array
    {
        [$item, $variant] = array_pad(explode(':', $key, 2), 2, '0');

        return [(int) $item, (int) $variant];
    }

    /** "YYYY-MM-DD HH" per driver. */
    public static function hourBucketExpr(string $column): string
    {
        return match (DB::getDriverName()) {
            'sqlite' => "strftime('%Y-%m-%d %H', {$column})",
            'pgsql' => "TO_CHAR({$column}, 'YYYY-MM-DD HH24')",
            default => "DATE_FORMAT({$column}, '%Y-%m-%d %H')",
        };
    }

    /** @return array{0: Carbon, 1: Carbon} */
    private function tradingRange(string $fromDate, string $toDate, PlanSlots $slots): array
    {
        $tz = config('app.timezone');
        $dayStart = $slots->dayStartHour();

        return [
            Carbon::parse($fromDate, $tz)->setTime($dayStart, 0),
            Carbon::parse($toDate, $tz)->addDay()->setTime($dayStart, 0),
        ];
    }

    /** @return array{0: string, 1: string|null} trading date and slot key for an hour bucket */
    private function place(string $bucket, PlanSlots $slots): array
    {
        [$date, $hour] = array_pad(explode(' ', $bucket, 2), 2, '0');
        $hour = (int) $hour;
        $at = Carbon::parse($date, config('app.timezone'))->setTime($hour, 0);

        return [$slots->businessDate($at), $slots->keyForHour($hour)];
    }
}
