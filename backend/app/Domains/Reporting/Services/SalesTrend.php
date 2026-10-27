<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use App\Domains\Reporting\Support\ProductName;
use App\Domains\Reporting\Support\ReportMoneySql;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * The dashboard's Sales section (owner, 2026-10-27: "enhance the admin dash
 * board. This is how Loyverse dashboard is … I need more advanced graphics and
 * features and animations"): one period, its figures beside the period just
 * before it of the same length, a series per hour, day, week or month, a
 * weekday × hour grid, and the period's split by order type, payment method,
 * staff and dish.
 *
 * Sales are every paid order (ReportMoneySql::sale), gift card sales left out
 * as in the sales summary; refunds count on the day they were approved; net
 * is sales less refunds and GST, as the daily summary has it. Everything is
 * read at hour grain once and rolled up here, so the drivers' date functions
 * stay out of all but one expression.
 */
final class SalesTrend
{
    public const GROUPS = ['hour', 'day', 'week', 'month'];

    /** Longest period an hour-by-hour series is drawn for. */
    public const HOUR_MAX_DAYS = 7;

    private const REFUND_STATUSES = ['approved', 'processed', 'completed'];

    /**
     * @param array{user_id?: ?int, type?: ?string, hour_from?: ?int, hour_to?: ?int} $filters
     * @return array<string, mixed>
     */
    public function report(CarbonImmutable $from, CarbonImmutable $to, string $group, array $filters = []): array
    {
        $from = $from->startOfDay();
        $to = $to->endOfDay();
        $days = (int) $from->diffInDays($to->startOfDay()) + 1;
        if ($group === 'hour' && $days > self::HOUR_MAX_DAYS) {
            $group = 'day';
        }

        $prevTo = $from->subDay()->endOfDay();
        $prevFrom = $from->subDays($days)->startOfDay();

        $hours = $this->hourRows($from, $to, $filters);
        $prevHours = $this->hourRows($prevFrom, $prevTo, $filters);

        return [
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'days' => $days, 'group' => $group],
            'previous' => ['from' => $prevFrom->toDateString(), 'to' => $prevTo->toDateString()],
            'filters' => array_filter($filters, fn ($v) => $v !== null && $v !== ''),
            'totals' => $this->totals($hours),
            'previous_totals' => $this->totals($prevHours),
            'series' => $this->series($hours, $from, $to, $group),
            'previous_series' => $this->series($prevHours, $prevFrom, $prevTo, $group),
            'heatmap' => $this->heatmap($hours),
            'by_type' => $this->byType($from, $to, $filters),
            'by_payment' => $this->byPayment($from, $to, $filters),
            'by_staff' => $this->byStaff($from, $to, $filters),
            'top_items' => $this->topItems($from, $to, $filters),
            'staff' => $this->staffChoices($from, $to),
        ];
    }

    /**
     * Every metric per clock hour that had any activity, keyed "Y-m-d H".
     *
     * @return array<string, array{sales: float, orders: int, discounts: float, tax: float, refunds: float, items: float}>
     */
    private function hourRows(CarbonImmutable $from, CarbonImmutable $to, array $filters): array
    {
        $out = [];
        $blank = ['sales' => 0.0, 'orders' => 0, 'discounts' => 0.0, 'tax' => 0.0, 'refunds' => 0.0, 'items' => 0.0];

        $orders = $this->orders($from, $to, $filters)
            ->selectRaw(self::hourKey('orders.created_at') . ' as hk, COUNT(*) as orders')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TOTAL_LAAR) . ' as sales')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_DISCOUNT_LAAR) . ' as discounts')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TAX_LAAR) . ' as tax')
            ->groupByRaw(self::hourKey('orders.created_at'))
            ->get();
        foreach ($orders as $r) {
            $out[$r->hk] = ['sales' => (float) $r->sales, 'orders' => (int) $r->orders, 'discounts' => (float) $r->discounts, 'tax' => (float) $r->tax] + $blank;
        }

        $items = $this->orders($from, $to, $filters)
            ->join('order_items', 'order_items.order_id', '=', 'orders.id')
            ->whereNull('order_items.deleted_at')
            ->selectRaw(self::hourKey('orders.created_at') . ' as hk, COALESCE(SUM(order_items.quantity), 0) as qty')
            ->groupByRaw(self::hourKey('orders.created_at'))
            ->get();
        foreach ($items as $r) {
            $out[$r->hk] = ($out[$r->hk] ?? $blank);
            $out[$r->hk]['items'] = (float) $r->qty;
        }

        $refunds = DB::table('refunds')
            ->join('orders', 'orders.id', '=', 'refunds.order_id')
            ->whereBetween('refunds.created_at', [$from, $to])
            ->whereIn('refunds.status', self::REFUND_STATUSES)
            ->when($filters['user_id'] ?? null, fn ($q, $id) => $q->where('orders.user_id', $id))
            ->when($filters['type'] ?? null, fn ($q, $t) => $q->where('orders.type', $t))
            ->selectRaw(self::hourKey('refunds.created_at') . ' as hk')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::REFUND_AMOUNT_LAAR) . ' as refunds')
            ->groupByRaw(self::hourKey('refunds.created_at'))
            ->get();
        foreach ($refunds as $r) {
            $out[$r->hk] = ($out[$r->hk] ?? $blank);
            $out[$r->hk]['refunds'] = (float) $r->refunds;
        }

        // Time of day: only the hours asked for (a range may wrap past midnight).
        $hf = $filters['hour_from'] ?? null;
        $ht = $filters['hour_to'] ?? null;
        if ($hf !== null && $ht !== null) {
            $out = array_filter($out, function (string $key) use ($hf, $ht): bool {
                $h = (int) substr($key, 11, 2);

                return $hf <= $ht ? ($h >= $hf && $h <= $ht) : ($h >= $hf || $h <= $ht);
            }, ARRAY_FILTER_USE_KEY);
        }

        return $out;
    }

    /** @param array<string, array<string, float|int>> $hours */
    private function totals(array $hours): array
    {
        $t = ['sales' => 0.0, 'orders' => 0, 'discounts' => 0.0, 'tax' => 0.0, 'refunds' => 0.0, 'items' => 0.0];
        foreach ($hours as $row) {
            foreach ($t as $k => $_) {
                $t[$k] += $row[$k];
            }
        }

        return self::finish($t);
    }

    /** Rounds, and adds net and the average order. */
    private static function finish(array $t): array
    {
        $out = [
            'sales' => round($t['sales'], 2),
            'refunds' => round($t['refunds'], 2),
            'discounts' => round($t['discounts'], 2),
            'tax' => round($t['tax'], 2),
            'net' => round($t['sales'] - $t['refunds'] - $t['tax'], 2),
            'orders' => (int) $t['orders'],
            'avg_order' => $t['orders'] > 0 ? round($t['sales'] / $t['orders'], 2) : 0.0,
            'items' => round($t['items'], 2),
        ];

        return $out;
    }

    /** One point per bucket of the period, empty buckets included, in order. */
    private function series(array $hours, CarbonImmutable $from, CarbonImmutable $to, string $group): array
    {
        $buckets = [];
        $cursor = match ($group) {
            'hour' => $from->startOfHour(),
            'week' => $from->startOfWeek(CarbonImmutable::MONDAY),
            'month' => $from->startOfMonth(),
            default => $from->startOfDay(),
        };
        while ($cursor <= $to) {
            $buckets[self::bucketKey($cursor, $group)] = [
                'start' => $cursor,
                'sum' => ['sales' => 0.0, 'orders' => 0, 'discounts' => 0.0, 'tax' => 0.0, 'refunds' => 0.0, 'items' => 0.0],
            ];
            $cursor = match ($group) {
                'hour' => $cursor->addHour(),
                'week' => $cursor->addWeek(),
                'month' => $cursor->addMonth(),
                default => $cursor->addDay(),
            };
        }

        foreach ($hours as $key => $row) {
            $at = CarbonImmutable::createFromFormat('Y-m-d H', $key);
            if ($at === false) {
                continue;
            }
            $bk = self::bucketKey($at, $group);
            if (!isset($buckets[$bk])) {
                continue;
            }
            foreach ($buckets[$bk]['sum'] as $k => $_) {
                $buckets[$bk]['sum'][$k] += $row[$k];
            }
        }

        $out = [];
        foreach ($buckets as $key => $b) {
            /** @var CarbonImmutable $start */
            $start = $b['start'];
            // A week or month that starts before the period, or runs past it, says so.
            $first = $start < $from ? $from : $start;
            $last = match ($group) {
                'hour' => $start->endOfHour(),
                'week' => $start->endOfWeek(CarbonImmutable::SUNDAY),
                'month' => $start->endOfMonth(),
                default => $start->endOfDay(),
            };
            $last = $last > $to ? $to : $last;
            $out[] = ['key' => $key, 'from' => $first->format($group === 'hour' ? 'Y-m-d H:00' : 'Y-m-d'), 'to' => $last->format($group === 'hour' ? 'Y-m-d H:59' : 'Y-m-d')] + self::finish($b['sum']);
        }

        return $out;
    }

    private static function bucketKey(CarbonImmutable $at, string $group): string
    {
        return match ($group) {
            'hour' => $at->format('Y-m-d H'),
            'week' => $at->startOfWeek(CarbonImmutable::MONDAY)->format('Y-m-d'),
            'month' => $at->format('Y-m'),
            default => $at->format('Y-m-d'),
        };
    }

    /**
     * Sales and orders by weekday (0 = Monday) and hour, for the "when are we
     * busy" grid.
     *
     * @return list<list<array{sales: float, orders: int}>>
     */
    private function heatmap(array $hours): array
    {
        $grid = array_fill(0, 7, array_fill(0, 24, ['sales' => 0.0, 'orders' => 0]));
        foreach ($hours as $key => $row) {
            $at = CarbonImmutable::createFromFormat('Y-m-d H', $key);
            if ($at === false) {
                continue;
            }
            $d = ($at->dayOfWeekIso - 1);
            $h = (int) $at->format('G');
            $grid[$d][$h]['sales'] = round($grid[$d][$h]['sales'] + $row['sales'], 2);
            $grid[$d][$h]['orders'] += $row['orders'];
        }

        return $grid;
    }

    private function byType(CarbonImmutable $from, CarbonImmutable $to, array $filters): array
    {
        return $this->hourFiltered($this->orders($from, $to, $filters), $filters)
            ->selectRaw('orders.type as type, COUNT(*) as orders')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TOTAL_LAAR) . ' as sales')
            ->groupBy('orders.type')
            ->orderByDesc('sales')
            ->get()
            ->map(fn ($r) => ['type' => $r->type ?? 'unknown', 'orders' => (int) $r->orders, 'sales' => (float) $r->sales])
            ->values()->all();
    }

    private function byPayment(CarbonImmutable $from, CarbonImmutable $to, array $filters): array
    {
        return $this->hourFiltered($this->orders($from, $to, $filters), $filters)
            ->join('payments', 'payments.order_id', '=', 'orders.id')
            ->whereIn('payments.status', ['paid', 'completed', 'confirmed'])
            ->selectRaw('payments.method as method, COUNT(DISTINCT orders.id) as orders')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::PAYMENT_AMOUNT_LAAR) . ' as amount')
            ->groupBy('payments.method')
            ->orderByDesc('amount')
            ->get()
            ->map(fn ($r) => ['method' => (string) $r->method, 'orders' => (int) $r->orders, 'amount' => (float) $r->amount])
            ->values()->all();
    }

    private function byStaff(CarbonImmutable $from, CarbonImmutable $to, array $filters): array
    {
        return $this->hourFiltered($this->orders($from, $to, $filters), $filters)
            ->leftJoin('users', 'users.id', '=', 'orders.user_id')
            ->selectRaw('orders.user_id as user_id, users.name as name, COUNT(*) as orders')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TOTAL_LAAR) . ' as sales')
            ->groupBy('orders.user_id', 'users.name')
            ->orderByDesc('sales')
            ->limit(8)
            ->get()
            ->map(fn ($r) => [
                'user_id' => $r->user_id !== null ? (int) $r->user_id : null,
                // An order with no staff on it came in online.
                'name' => $r->user_id === null ? 'Online (no staff)' : (string) ($r->name ?? 'Former staff'),
                'orders' => (int) $r->orders,
                'sales' => (float) $r->sales,
            ])
            ->values()->all();
    }

    /** Each size is its own product (owner, 2026-10-07). */
    private function topItems(CarbonImmutable $from, CarbonImmutable $to, array $filters): array
    {
        return $this->hourFiltered($this->orders($from, $to, $filters), $filters)
            ->join('order_items', 'order_items.order_id', '=', 'orders.id')
            ->join('items', 'items.id', '=', 'order_items.item_id')
            ->whereNull('order_items.deleted_at')
            ->selectRaw('items.id as item_id, order_items.variant_id, items.name, order_items.variant_name, SUM(order_items.quantity) as qty, SUM(order_items.quantity * order_items.unit_price) as sales')
            ->groupBy('items.id', 'items.name', 'order_items.variant_id', 'order_items.variant_name')
            ->orderByDesc('sales')
            ->limit(8)
            ->get()
            ->map(fn ($r) => [
                'key' => ProductName::key($r->item_id, $r->variant_id, $r->variant_name),
                'name' => ProductName::label($r->name, $r->variant_name),
                'qty' => round((float) $r->qty, 2),
                'sales' => round((float) $r->sales, 2),
            ])
            ->values()->all();
    }

    /** Who rang up sales in the period, for the staff filter. */
    private function staffChoices(CarbonImmutable $from, CarbonImmutable $to): array
    {
        return DB::table('orders')
            ->join('users', 'users.id', '=', 'orders.user_id')
            ->whereBetween('orders.created_at', [$from->subDays(60), $to])
            ->where(ReportMoneySql::sale('orders.'))
            ->select('users.id', 'users.name')
            ->distinct()
            ->orderBy('users.name')
            ->get()
            ->map(fn ($r) => ['id' => (int) $r->id, 'name' => (string) $r->name])
            ->values()->all();
    }

    private function orders(CarbonImmutable $from, CarbonImmutable $to, array $filters): Builder
    {
        return DB::table('orders')
            ->whereBetween('orders.created_at', [$from, $to])
            ->where(ReportMoneySql::sale('orders.'))
            ->where(fn ($q) => $q->whereNull('orders.type')->orWhere('orders.type', '!=', 'gift_card'))
            ->when($filters['user_id'] ?? null, fn ($q, $id) => $q->where('orders.user_id', $id))
            ->when($filters['type'] ?? null, fn ($q, $t) => $q->where('orders.type', $t));
    }

    /** The time-of-day filter on a query grouped by something other than the hour. */
    private function hourFiltered(Builder $q, array $filters): Builder
    {
        $hf = $filters['hour_from'] ?? null;
        $ht = $filters['hour_to'] ?? null;
        if ($hf === null || $ht === null) {
            return $q;
        }
        $hour = self::hourOf('orders.created_at');

        return $hf <= $ht
            ? $q->whereRaw("{$hour} BETWEEN ? AND ?", [$hf, $ht])
            : $q->where(fn ($w) => $w->whereRaw("{$hour} >= ?", [$hf])->orWhereRaw("{$hour} <= ?", [$ht]));
    }

    private static function hourKey(string $column): string
    {
        return match (DB::getDriverName()) {
            'sqlite' => "strftime('%Y-%m-%d %H', {$column})",
            'pgsql' => "to_char({$column}, 'YYYY-MM-DD HH24')",
            default => "DATE_FORMAT({$column}, '%Y-%m-%d %H')",
        };
    }

    private static function hourOf(string $column): string
    {
        return match (DB::getDriverName()) {
            'sqlite' => "CAST(strftime('%H', {$column}) AS INTEGER)",
            'pgsql' => "EXTRACT(HOUR FROM {$column})::INTEGER",
            default => "HOUR({$column})",
        };
    }
}
