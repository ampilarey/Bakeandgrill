<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Shift;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * All reporting aggregate queries in one place.
 * The ReportsController is a thin HTTP layer that calls these methods.
 * Swap the underlying queries here without touching routing or HTTP concerns.
 */
class ReportsService
{
    /**
     * Sales summary totals and payment breakdown for a date range.
     */
    public function salesSummary(Carbon $from, Carbon $to): array
    {
        $agg = Order::whereBetween('created_at', [$from, $to])
            ->where('status', 'completed')
            ->selectRaw('COUNT(*) as orders_count, COALESCE(SUM(subtotal),0) as subtotal, COALESCE(SUM(tax_amount),0) as tax_amount, COALESCE(SUM(discount_amount),0) as discount_amount, COALESCE(SUM(total),0) as total')
            ->first();

        $totals = [
            'orders_count' => (int) ($agg->orders_count ?? 0),
            'subtotal' => (float) ($agg->subtotal ?? 0),
            'tax_amount' => (float) ($agg->tax_amount ?? 0),
            'discount_amount' => (float) ($agg->discount_amount ?? 0),
            'total' => (float) ($agg->total ?? 0),
        ];

        $payments = Payment::whereBetween('processed_at', [$from, $to])
            ->whereIn('status', ['paid', 'completed'])
            ->select('method', DB::raw('SUM(amount) as total'))
            ->groupBy('method')
            ->pluck('total', 'method');

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'totals' => $totals,
            'payments' => $payments,
        ];
    }

    /**
     * Sales breakdown by item, category, and employee for a date range.
     */
    public function salesBreakdown(Carbon $from, Carbon $to, int $limit = 100): array
    {
        $items = OrderItem::select(
            'item_id',
            'item_name',
            DB::raw('SUM(quantity) as quantity'),
            DB::raw('SUM(total_price) as total'),
        )
            ->whereHas('order', fn ($q) => $q->whereBetween('created_at', [$from, $to])->where('status', 'completed'))
            ->groupBy('item_id', 'item_name')
            ->orderByDesc('total')
            ->limit(min($limit, 500))
            ->get();

        $categories = OrderItem::select(
            'categories.id as category_id',
            'categories.name as category_name',
            DB::raw('SUM(order_items.quantity) as quantity'),
            DB::raw('SUM(order_items.total_price) as total'),
        )
            ->join('items', 'items.id', '=', 'order_items.item_id')
            ->join('categories', 'categories.id', '=', 'items.category_id')
            ->whereHas('order', fn ($q) => $q->whereBetween('created_at', [$from, $to])->where('status', 'completed'))
            ->groupBy('categories.id', 'categories.name')
            ->orderByDesc('total')
            ->limit(50)
            ->get();

        $employees = Order::leftJoin('users', 'users.id', '=', 'orders.user_id')
            ->select('orders.user_id', 'users.name', DB::raw('COUNT(*) as orders_count'), DB::raw('SUM(orders.total) as total'))
            ->whereBetween('orders.created_at', [$from, $to])
            ->where('orders.status', 'completed')
            ->groupBy('orders.user_id', 'users.name')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'user_id' => $row->user_id,
                'name' => $row->name,
                'orders_count' => (int) $row->orders_count,
                'total' => (float) $row->total,
            ]);

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'items' => $items,
            'categories' => $categories,
            'employees' => $employees,
        ];
    }

    /**
     * X-Report: mid-shift totals for the currently open shift of the given user.
     * Returns null if no active shift exists.
     */
    public function xReport(int $userId): ?array
    {
        $shift = Shift::where('user_id', $userId)->whereNull('closed_at')->latest('opened_at')->first();

        if (! $shift) {
            return null;
        }

        $from = $shift->opened_at;
        $to = now();

        $agg = Order::where('user_id', $shift->user_id)
            ->whereBetween('created_at', [$from, $to])
            ->where('status', 'completed')
            ->selectRaw('COUNT(*) as orders_count, COALESCE(SUM(subtotal),0) as subtotal, COALESCE(SUM(tax_amount),0) as tax_amount, COALESCE(SUM(discount_amount),0) as discount_amount, COALESCE(SUM(total),0) as total')
            ->first();

        $totals = [
            'orders_count' => (int) ($agg->orders_count ?? 0),
            'subtotal' => (float) ($agg->subtotal ?? 0),
            'tax_amount' => (float) ($agg->tax_amount ?? 0),
            'discount_amount' => (float) ($agg->discount_amount ?? 0),
            'total' => (float) ($agg->total ?? 0),
        ];

        $payments = Payment::whereBetween('processed_at', [$from, $to])
            ->whereIn('status', ['paid', 'completed'])
            ->whereHas('order', fn ($q) => $q->where('user_id', $shift->user_id))
            ->select('method', DB::raw('SUM(amount) as total'))
            ->groupBy('method')
            ->pluck('total', 'method');

        $refundsTotal = Refund::whereBetween('created_at', [$from, $to])
            ->whereHas('order', fn ($q) => $q->where('user_id', $shift->user_id))
            ->sum('amount');

        return [
            'shift' => $shift,
            'from' => $from->toDateTimeString(),
            'to' => $to->toDateTimeString(),
            'totals' => $totals,
            'payments' => $payments,
            'refunds' => $refundsTotal,
        ];
    }

    /**
     * Z-Report: end-of-day totals for a date range.
     */
    public function zReport(Carbon $from, Carbon $to): array
    {
        $agg = Order::whereBetween('created_at', [$from, $to])
            ->where('status', 'completed')
            ->selectRaw('COUNT(*) as orders_count, COALESCE(SUM(subtotal),0) as subtotal, COALESCE(SUM(tax_amount),0) as tax_amount, COALESCE(SUM(discount_amount),0) as discount_amount, COALESCE(SUM(total),0) as total')
            ->first();

        $totals = [
            'orders_count' => (int) ($agg->orders_count ?? 0),
            'subtotal' => (float) ($agg->subtotal ?? 0),
            'tax_amount' => (float) ($agg->tax_amount ?? 0),
            'discount_amount' => (float) ($agg->discount_amount ?? 0),
            'total' => (float) ($agg->total ?? 0),
        ];

        $payments = Payment::whereBetween('processed_at', [$from, $to])
            ->whereIn('status', ['paid', 'completed'])
            ->select('method', DB::raw('SUM(amount) as total'))
            ->groupBy('method')
            ->pluck('total', 'method');

        $refunds = Refund::whereBetween('created_at', [$from, $to])->sum('amount');

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'totals' => $totals,
            'payments' => $payments,
            'refunds' => $refunds,
        ];
    }

    /**
     * Inventory valuation — total stock value and quantity across all items.
     */
    public function inventoryValuation(): array
    {
        $totals = InventoryItem::select(
            DB::raw('SUM(COALESCE(current_stock, 0) * COALESCE(unit_cost, 0)) as value'),
            DB::raw('SUM(COALESCE(current_stock, 0)) as quantity'),
        )->first();

        return [
            'value' => (float) ($totals->value ?? 0),
            'quantity' => (float) ($totals->quantity ?? 0),
        ];
    }
}
