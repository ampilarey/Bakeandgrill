<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Shift;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportsController extends Controller
{
    public function salesSummary(Request $request)
    {
        $from = $request->query('from')
            ? Carbon::parse($request->query('from'))->startOfDay()
            : now()->startOfDay();
        $to = $request->query('to')
            ? Carbon::parse($request->query('to'))->endOfDay()
            : now()->endOfDay();

        $orders = Order::whereBetween('created_at', [$from, $to])
            ->where('status', 'completed');

        $totals = [
            'orders_count' => $orders->count(),
            'subtotal' => $orders->sum('subtotal'),
            'tax_amount' => $orders->sum('tax_amount'),
            'discount_amount' => $orders->sum('discount_amount'),
            'total' => $orders->sum('total'),
        ];

        $payments = Payment::whereBetween('processed_at', [$from, $to])
            ->whereIn('status', ['paid', 'completed'])
            ->get()
            ->groupBy('method')
            ->map(fn ($group) => $group->sum('amount'));

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'totals' => $totals,
            'payments' => $payments,
        ]);
    }

    public function salesBreakdown(Request $request)
    {
        $from = $request->query('from')
            ? Carbon::parse($request->query('from'))->startOfDay()
            : now()->startOfDay();
        $to = $request->query('to')
            ? Carbon::parse($request->query('to'))->endOfDay()
            : now()->endOfDay();

        $items = OrderItem::select(
                'item_id',
                'item_name',
                DB::raw('SUM(quantity) as quantity'),
                DB::raw('SUM(total_price) as total')
            )
            ->whereHas('order', function ($query) use ($from, $to) {
                $query->whereBetween('created_at', [$from, $to])
                    ->where('status', 'completed');
            })
            ->groupBy('item_id', 'item_name')
            ->orderByDesc('total')
            ->get();

        $categories = OrderItem::select(
                'categories.id as category_id',
                'categories.name as category_name',
                DB::raw('SUM(order_items.quantity) as quantity'),
                DB::raw('SUM(order_items.total_price) as total')
            )
            ->join('items', 'items.id', '=', 'order_items.item_id')
            ->join('categories', 'categories.id', '=', 'items.category_id')
            ->whereHas('order', function ($query) use ($from, $to) {
                $query->whereBetween('created_at', [$from, $to])
                    ->where('status', 'completed');
            })
            ->groupBy('categories.id', 'categories.name')
            ->orderByDesc('total')
            ->get();

        $employees = Order::select(
                'user_id',
                DB::raw('COUNT(*) as orders_count'),
                DB::raw('SUM(total) as total')
            )
            ->whereBetween('created_at', [$from, $to])
            ->where('status', 'completed')
            ->groupBy('user_id')
            ->orderByDesc('total')
            ->get()
            ->map(function ($row) {
                $user = User::find($row->user_id);
                return [
                    'user_id' => $row->user_id,
                    'name' => $user?->name,
                    'orders_count' => (int) $row->orders_count,
                    'total' => (float) $row->total,
                ];
            });

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'items' => $items,
            'categories' => $categories,
            'employees' => $employees,
        ]);
    }

    public function xReport(Request $request)
    {
        $shift = Shift::where('user_id', $request->user()?->id)
            ->whereNull('closed_at')
            ->latest('opened_at')
            ->first();

        if (!$shift) {
            return response()->json(['message' => 'No active shift.'], 422);
        }

        $from = $shift->opened_at;
        $to = now();

        $orders = Order::where('user_id', $shift->user_id)
            ->whereBetween('created_at', [$from, $to])
            ->where('status', 'completed');

        $totals = [
            'orders_count' => $orders->count(),
            'subtotal' => $orders->sum('subtotal'),
            'tax_amount' => $orders->sum('tax_amount'),
            'discount_amount' => $orders->sum('discount_amount'),
            'total' => $orders->sum('total'),
        ];

        $payments = Payment::whereBetween('processed_at', [$from, $to])
            ->whereIn('status', ['paid', 'completed'])
            ->whereHas('order', function ($query) use ($shift) {
                $query->where('user_id', $shift->user_id);
            })
            ->get()
            ->groupBy('method')
            ->map(fn ($group) => $group->sum('amount'));

        $refundsTotal = Refund::whereBetween('created_at', [$from, $to])
            ->whereHas('order', function ($query) use ($shift) {
                $query->where('user_id', $shift->user_id);
            })
            ->sum('amount');

        return response()->json([
            'shift' => $shift,
            'from' => $from->toDateTimeString(),
            'to' => $to->toDateTimeString(),
            'totals' => $totals,
            'payments' => $payments,
            'refunds' => $refundsTotal,
        ]);
    }

    public function zReport(Request $request)
    {
        $from = $request->query('from')
            ? Carbon::parse($request->query('from'))->startOfDay()
            : now()->startOfDay();
        $to = $request->query('to')
            ? Carbon::parse($request->query('to'))->endOfDay()
            : now()->endOfDay();

        $orders = Order::whereBetween('created_at', [$from, $to])
            ->where('status', 'completed');

        $totals = [
            'orders_count' => $orders->count(),
            'subtotal' => $orders->sum('subtotal'),
            'tax_amount' => $orders->sum('tax_amount'),
            'discount_amount' => $orders->sum('discount_amount'),
            'total' => $orders->sum('total'),
        ];

        $payments = Payment::whereBetween('processed_at', [$from, $to])
            ->whereIn('status', ['paid', 'completed'])
            ->get()
            ->groupBy('method')
            ->map(fn ($group) => $group->sum('amount'));

        $refunds = Refund::whereBetween('created_at', [$from, $to])
            ->sum('amount');

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'totals' => $totals,
            'payments' => $payments,
            'refunds' => $refunds,
        ]);
    }

    public function inventoryValuation()
    {
        $totals = InventoryItem::select(
                DB::raw('SUM(COALESCE(current_stock, 0) * COALESCE(unit_cost, 0)) as value'),
                DB::raw('SUM(COALESCE(current_stock, 0)) as quantity')
            )
            ->first();

        return response()->json([
            'value' => (float) ($totals->value ?? 0),
            'quantity' => (float) ($totals->quantity ?? 0),
        ]);
    }
}
