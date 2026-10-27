<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use App\Domains\Reporting\Support\ProductName;
use App\Domains\Reporting\Support\ReportMoneySql;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Every item sold in a period (owner, 2026-10-27: "how can i see all the items
 * sold by a specific date and specific time of period, with or without
 * category"). The dates pick the days; the times, when given, pick the same
 * hours on each of those days (2:30 PM to 6 PM every day, or 10 PM to 2 AM past
 * midnight). Each size is its own row (owner, 2026-10-07); a category pick
 * takes its sub-categories with it. Sales are every paid order
 * (ReportMoneySql::sale), gift card sales left out, removed lines left out.
 */
final class ItemsSold
{
    /**
     * @param array{time_from?: ?string, time_to?: ?string, category_id?: ?int, user_id?: ?int, type?: ?string} $f
     * @return array<string, mixed>
     */
    public function report(CarbonImmutable $from, CarbonImmutable $to, array $f = []): array
    {
        $from = $from->startOfDay();
        $to = $to->endOfDay();
        $tf = $f['time_from'] ?? null;
        $tt = $f['time_to'] ?? null;
        $categoryIds = isset($f['category_id']) ? $this->withChildren((int) $f['category_id']) : null;

        $q = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->leftJoin('items', 'items.id', '=', 'order_items.item_id')
            ->leftJoin('categories', 'categories.id', '=', 'items.category_id')
            ->leftJoin('categories as parents', 'parents.id', '=', 'categories.parent_id')
            ->whereNull('order_items.deleted_at')
            ->whereBetween('orders.created_at', [$from, $to])
            ->where(ReportMoneySql::sale('orders.'))
            ->where(fn ($w) => $w->whereNull('orders.type')->orWhere('orders.type', '!=', 'gift_card'))
            ->when($f['user_id'] ?? null, fn ($w, $id) => $w->where('orders.user_id', $id))
            ->when($f['type'] ?? null, fn ($w, $t) => $w->where('orders.type', $t))
            ->when($categoryIds !== null, fn ($w) => $w->whereIn('items.category_id', $categoryIds));

        if ($tf !== null && $tt !== null) {
            $time = self::timeOf('orders.created_at');
            $a = $tf . ':00';
            $b = $tt . ':59';
            $tf <= $tt
                ? $q->whereRaw("{$time} BETWEEN ? AND ?", [$a, $b])
                : $q->where(fn ($w) => $w->whereRaw("{$time} >= ?", [$a])->orWhereRaw("{$time} <= ?", [$b]));
        }

        $rows = (clone $q)
            ->selectRaw('order_items.item_id, order_items.variant_id, order_items.variant_name')
            ->selectRaw('MAX(COALESCE(items.name, order_items.item_name)) as name')
            ->selectRaw('MAX(categories.id) as category_id, MAX(categories.name) as category_name, MAX(parents.name) as parent_name')
            ->selectRaw('SUM(order_items.quantity) as qty, SUM(order_items.total_price) as sales')
            ->selectRaw('COUNT(DISTINCT orders.id) as orders')
            ->groupBy('order_items.item_id', 'order_items.variant_id', 'order_items.variant_name')
            ->orderByDesc('sales')
            ->get();

        $totalSales = (float) $rows->sum('sales');
        $items = $rows->map(function ($r) use ($totalSales) {
            $qty = (float) $r->qty;
            $sales = round((float) $r->sales, 2);
            $category = $r->category_name === null ? null
                : ($r->parent_name ? $r->parent_name . ' › ' . $r->category_name : (string) $r->category_name);

            return [
                'key' => ProductName::key($r->item_id, $r->variant_id, $r->variant_name),
                'item_id' => $r->item_id !== null ? (int) $r->item_id : null,
                'variant_id' => $r->variant_id !== null ? (int) $r->variant_id : null,
                'name' => ProductName::label((string) $r->name, $r->variant_name),
                'category_id' => $r->category_id !== null ? (int) $r->category_id : null,
                'category' => $category ?? 'No category',
                'qty' => round($qty, 2),
                'sales' => $sales,
                'avg_price' => $qty > 0 ? round($sales / $qty, 2) : 0.0,
                'orders' => (int) $r->orders,
                'share' => $totalSales > 0 ? round($sales / $totalSales * 100, 1) : 0.0,
            ];
        })->values();

        $categories = $items->groupBy('category')->map(fn ($g, $name) => [
            'category' => (string) $name,
            'category_id' => $g->first()['category_id'],
            'items' => $g->count(),
            'qty' => round((float) $g->sum('qty'), 2),
            'sales' => round((float) $g->sum('sales'), 2),
            'share' => $totalSales > 0 ? round((float) $g->sum('sales') / $totalSales * 100, 1) : 0.0,
        ])->sortByDesc('sales')->values();

        return [
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'time_from' => $tf, 'time_to' => $tt],
            'totals' => [
                'items' => $items->count(),
                'qty' => round((float) $items->sum('qty'), 2),
                'sales' => round($totalSales, 2),
                'orders' => (int) (clone $q)->distinct()->count('orders.id'),
            ],
            'items' => $items->all(),
            'categories' => $categories->all(),
            'category_choices' => $this->categoryChoices(),
            'staff_choices' => DB::table('orders')
                ->join('users', 'users.id', '=', 'orders.user_id')
                ->whereBetween('orders.created_at', [$from->subDays(60), $to])
                ->where(ReportMoneySql::sale('orders.'))
                ->select('users.id', 'users.name')->distinct()->orderBy('users.name')->get()
                ->map(fn ($u) => ['id' => (int) $u->id, 'name' => (string) $u->name])->values()->all(),
        ];
    }

    /** @return list<int> */
    private function withChildren(int $id): array
    {
        $ids = [$id];
        $frontier = [$id];
        // Categories nest a level or two; stop after five in case of a loop.
        for ($depth = 0; $depth < 5 && $frontier !== []; $depth++) {
            $frontier = DB::table('categories')->whereIn('parent_id', $frontier)->pluck('id')->map(fn ($v) => (int) $v)->diff($ids)->values()->all();
            $ids = array_merge($ids, $frontier);
        }

        return $ids;
    }

    /** @return list<array{id: int, name: string}> */
    private function categoryChoices(): array
    {
        $all = DB::table('categories')->orderBy('sort_order')->orderBy('name')->get(['id', 'name', 'parent_id']);
        $byId = $all->keyBy('id');

        return $all->map(fn ($c) => [
            'id' => (int) $c->id,
            'name' => $c->parent_id && isset($byId[$c->parent_id]) ? $byId[$c->parent_id]->name . ' › ' . $c->name : (string) $c->name,
        ])->sortBy('name', SORT_NATURAL | SORT_FLAG_CASE)->values()->all();
    }

    private static function timeOf(string $column): string
    {
        return match (DB::getDriverName()) {
            'sqlite' => "strftime('%H:%M:%S', {$column})",
            'pgsql' => "to_char({$column}, 'HH24:MI:SS')",
            default => "DATE_FORMAT({$column}, '%H:%i:%s')",
        };
    }
}
