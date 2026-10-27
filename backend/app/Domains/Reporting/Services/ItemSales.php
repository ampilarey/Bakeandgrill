<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use App\Domains\Reporting\Support\ReportMoneySql;
use App\Models\Item;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * One item's sales over a period (owner, 2026-10-27: "When i select an item,
 * which time this item is bought in a graph and different forms and different
 * times, dates, months"): when in the day and the week it sells, how that moved
 * over days, weeks or months against the period before, and its split by size,
 * order type and staff. The same rules as Items Sold: every paid order, gift
 * card sales and removed lines left out, the hours picked on each day.
 */
final class ItemSales
{
    public const GROUPS = ['hour', 'day', 'week', 'month'];

    /**
     * @param array{variant_id?: ?int, time_from?: ?string, time_to?: ?string, user_id?: ?int, type?: ?string} $f
     * @return array<string, mixed>
     */
    public function report(Item $item, CarbonImmutable $from, CarbonImmutable $to, string $group, array $f = []): array
    {
        $from = $from->startOfDay();
        $to = $to->endOfDay();
        $days = (int) $from->diffInDays($to->startOfDay()) + 1;
        if ($group === 'hour' && $days > SalesTrend::HOUR_MAX_DAYS) {
            $group = 'day';
        }
        $prevTo = $from->subDay()->endOfDay();
        $prevFrom = $from->subDays($days)->startOfDay();

        $hours = $this->hourRows($item, $from, $to, $f);
        $prevHours = $this->hourRows($item, $prevFrom, $prevTo, $f);

        $byHour = array_fill(0, 24, ['qty' => 0.0, 'sales' => 0.0, 'orders' => 0]);
        $byDay = array_fill(0, 7, ['qty' => 0.0, 'sales' => 0.0, 'orders' => 0]);
        $grid = array_fill(0, 7, array_fill(0, 24, ['qty' => 0.0, 'sales' => 0.0, 'orders' => 0]));
        foreach ($hours as $key => $r) {
            $at = CarbonImmutable::createFromFormat('Y-m-d H', $key);
            if ($at === false) {
                continue;
            }
            $h = (int) $at->format('G');
            $d = $at->dayOfWeekIso - 1;
            foreach (['qty', 'sales', 'orders'] as $k) {
                $byHour[$h][$k] += $r[$k];
                $byDay[$d][$k] += $r[$k];
                $grid[$d][$h][$k] += $r[$k];
            }
        }
        $round = fn (array $c) => ['qty' => round($c['qty'], 2), 'sales' => round($c['sales'], 2), 'orders' => (int) $c['orders']];

        $sizes = $item->variants()->orderBy('price')->get(['id', 'name', 'price', 'is_active']);

        return [
            'item' => [
                'id' => $item->id,
                'name' => $item->name,
                'category' => $item->category?->name,
                'sizes' => $sizes->map(fn ($v) => ['id' => $v->id, 'name' => $v->name, 'price' => (float) $v->price, 'active' => (bool) $v->is_active])->values()->all(),
            ],
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'days' => $days, 'group' => $group],
            'previous' => ['from' => $prevFrom->toDateString(), 'to' => $prevTo->toDateString()],
            'totals' => $this->totals($hours, $days),
            'previous_totals' => $this->totals($prevHours, $days),
            'series' => $this->series($hours, $from, $to, $group),
            'previous_series' => $this->series($prevHours, $prevFrom, $prevTo, $group),
            'by_hour' => array_map($round, $byHour),
            'by_weekday' => array_map($round, $byDay),
            'heatmap' => array_map(fn ($row) => array_map($round, $row), $grid),
            'by_size' => $this->split($item, $from, $to, $f, 'size'),
            'by_type' => $this->split($item, $from, $to, $f, 'type'),
            'by_staff' => $this->split($item, $from, $to, $f, 'staff'),
        ];
    }

    private function base(Item $item, CarbonImmutable $from, CarbonImmutable $to, array $f): Builder
    {
        $q = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('order_items.item_id', $item->id)
            ->whereNull('order_items.deleted_at')
            ->whereBetween('orders.created_at', [$from, $to])
            ->where(ReportMoneySql::sale('orders.'))
            ->where(fn ($w) => $w->whereNull('orders.type')->orWhere('orders.type', '!=', 'gift_card'))
            ->when($f['user_id'] ?? null, fn ($w, $id) => $w->where('orders.user_id', $id))
            ->when($f['type'] ?? null, fn ($w, $t) => $w->where('orders.type', $t));

        if (array_key_exists('variant_id', $f) && $f['variant_id'] !== null) {
            $f['variant_id'] === 0
                ? $q->whereNull('order_items.variant_id')
                : $q->where('order_items.variant_id', $f['variant_id']);
        }

        $tf = $f['time_from'] ?? null;
        $tt = $f['time_to'] ?? null;
        if ($tf !== null && $tt !== null) {
            $time = match (DB::getDriverName()) {
                'sqlite' => "strftime('%H:%M:%S', orders.created_at)",
                'pgsql' => "to_char(orders.created_at, 'HH24:MI:SS')",
                default => "DATE_FORMAT(orders.created_at, '%H:%i:%s')",
            };
            $a = $tf . ':00';
            $b = $tt . ':59';
            $tf <= $tt
                ? $q->whereRaw("{$time} BETWEEN ? AND ?", [$a, $b])
                : $q->where(fn ($w) => $w->whereRaw("{$time} >= ?", [$a])->orWhereRaw("{$time} <= ?", [$b]));
        }

        return $q;
    }

    /** @return array<string, array{qty: float, sales: float, orders: int}> keyed "Y-m-d H" */
    private function hourRows(Item $item, CarbonImmutable $from, CarbonImmutable $to, array $f): array
    {
        $hk = match (DB::getDriverName()) {
            'sqlite' => "strftime('%Y-%m-%d %H', orders.created_at)",
            'pgsql' => "to_char(orders.created_at, 'YYYY-MM-DD HH24')",
            default => "DATE_FORMAT(orders.created_at, '%Y-%m-%d %H')",
        };
        $out = [];
        foreach ($this->base($item, $from, $to, $f)
            ->selectRaw("{$hk} as hk, SUM(order_items.quantity) as qty, SUM(order_items.total_price) as sales, COUNT(DISTINCT orders.id) as orders")
            ->groupByRaw($hk)->get() as $r) {
            $out[$r->hk] = ['qty' => (float) $r->qty, 'sales' => (float) $r->sales, 'orders' => (int) $r->orders];
        }

        return $out;
    }

    private function totals(array $hours, int $days): array
    {
        $qty = array_sum(array_column($hours, 'qty'));
        $sales = array_sum(array_column($hours, 'sales'));
        $orders = array_sum(array_column($hours, 'orders'));

        return [
            'qty' => round($qty, 2),
            'sales' => round($sales, 2),
            'orders' => (int) $orders,
            'avg_price' => $qty > 0 ? round($sales / $qty, 2) : 0.0,
            'per_day' => $days > 0 ? round($qty / $days, 2) : 0.0,
            'per_order' => $orders > 0 ? round($qty / $orders, 2) : 0.0,
        ];
    }

    /**
     * One point per bucket, in the shape of the dashboard's chart: `items` is the
     * count sold, `sales` the money, `avg_order` the average price.
     */
    private function series(array $hours, CarbonImmutable $from, CarbonImmutable $to, string $group): array
    {
        $key = fn (CarbonImmutable $at) => match ($group) {
            'hour' => $at->format('Y-m-d H'),
            'week' => $at->startOfWeek(CarbonImmutable::MONDAY)->format('Y-m-d'),
            'month' => $at->format('Y-m'),
            default => $at->format('Y-m-d'),
        };
        $buckets = [];
        $cursor = match ($group) {
            'hour' => $from->startOfHour(),
            'week' => $from->startOfWeek(CarbonImmutable::MONDAY),
            'month' => $from->startOfMonth(),
            default => $from->startOfDay(),
        };
        while ($cursor <= $to) {
            $end = match ($group) {
                'hour' => $cursor->endOfHour(),
                'week' => $cursor->endOfWeek(CarbonImmutable::SUNDAY),
                'month' => $cursor->endOfMonth(),
                default => $cursor->endOfDay(),
            };
            $first = $cursor < $from ? $from : $cursor;
            $last = $end > $to ? $to : $end;
            $fmt = $group === 'hour' ? 'Y-m-d H:i' : 'Y-m-d';
            $buckets[$key($cursor)] = ['key' => $key($cursor), 'from' => $first->format($fmt), 'to' => $last->format($group === 'hour' ? 'Y-m-d H:59' : 'Y-m-d'), 'qty' => 0.0, 'sales' => 0.0, 'orders' => 0];
            $cursor = match ($group) {
                'hour' => $cursor->addHour(),
                'week' => $cursor->addWeek(),
                'month' => $cursor->addMonth(),
                default => $cursor->addDay(),
            };
        }
        foreach ($hours as $hk => $r) {
            $at = CarbonImmutable::createFromFormat('Y-m-d H', $hk);
            if ($at === false || !isset($buckets[$key($at)])) {
                continue;
            }
            $buckets[$key($at)]['qty'] += $r['qty'];
            $buckets[$key($at)]['sales'] += $r['sales'];
            $buckets[$key($at)]['orders'] += $r['orders'];
        }

        return array_values(array_map(fn ($b) => [
            'key' => $b['key'], 'from' => $b['from'], 'to' => $b['to'],
            'sales' => round($b['sales'], 2), 'items' => round($b['qty'], 2), 'orders' => (int) $b['orders'],
            'avg_order' => $b['qty'] > 0 ? round($b['sales'] / $b['qty'], 2) : 0.0,
            'net' => round($b['sales'], 2), 'refunds' => 0.0, 'discounts' => 0.0, 'tax' => 0.0,
        ], $buckets));
    }

    private function split(Item $item, CarbonImmutable $from, CarbonImmutable $to, array $f, string $by): array
    {
        $q = $this->base($item, $from, $to, $f);
        [$cols, $group] = match ($by) {
            'size' => ['order_items.variant_id as k, MAX(order_items.variant_name) as label', ['order_items.variant_id']],
            'type' => ['orders.type as k, orders.type as label', ['orders.type']],
            default => ['orders.user_id as k, MAX(users.name) as label', ['orders.user_id']],
        };
        if ($by === 'staff') {
            $q->leftJoin('users', 'users.id', '=', 'orders.user_id');
        }

        return $q->selectRaw("{$cols}, SUM(order_items.quantity) as qty, SUM(order_items.total_price) as sales, COUNT(DISTINCT orders.id) as orders")
            ->groupBy(...$group)
            ->orderByDesc('qty')
            ->limit(10)
            ->get()
            ->map(fn ($r) => [
                'key' => (string) ($r->k ?? 'none'),
                'label' => match ($by) {
                    'size' => $r->label ?: 'No size',
                    'staff' => $r->k === null ? 'Online (no staff)' : ($r->label ?: 'Former staff'),
                    default => (string) ($r->label ?? 'unknown'),
                },
                'qty' => round((float) $r->qty, 2),
                'sales' => round((float) $r->sales, 2),
                'orders' => (int) $r->orders,
            ])->values()->all();
    }
}
