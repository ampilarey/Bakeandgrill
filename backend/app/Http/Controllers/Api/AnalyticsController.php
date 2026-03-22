<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderItem;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class AnalyticsController extends Controller
{
    /**
     * Peak hours: orders per hour over the last N days.
     */
    public function peakHours(Request $request): JsonResponse
    {
        $days = min((int) ($request->query('days', 30)), 365);

        $hourExpr = match(DB::getDriverName()) {
            'sqlite'  => "CAST(strftime('%H', created_at) AS INTEGER)",
            'pgsql'   => 'EXTRACT(HOUR FROM created_at)::INTEGER',
            default   => 'HOUR(created_at)',
        };

        $rows = DB::table('orders')
            ->where('created_at', '>=', now()->subDays($days))
            ->whereNotIn('status', ['cancelled'])
            ->selectRaw("{$hourExpr} as hour, COUNT(*) as count, AVG(total) as avg_total")
            ->groupByRaw($hourExpr)
            ->orderBy('hour')
            ->get();

        $hours = [];
        for ($h = 0; $h < 24; $h++) {
            $row = $rows->firstWhere('hour', $h);
            $hours[] = [
                'hour'      => $h,
                'label'     => sprintf('%02d:00', $h),
                'count'     => $row ? (int) $row->count : 0,
                'avg_total' => $row ? round((float) $row->avg_total, 2) : 0,
            ];
        }

        return response()->json(['peak_hours' => $hours, 'days' => $days]);
    }

    /**
     * Customer retention: new vs returning customers per week.
     *
     * Uses 2 queries total (regardless of week count) instead of 2N queries.
     */
    public function retention(Request $request): JsonResponse
    {
        $weeks     = min((int) ($request->query('weeks', 12)), 52);
        $rangeStart = Carbon::now()->startOfWeek()->subWeeks($weeks - 1);
        $rangeEnd   = Carbon::now()->endOfWeek();

        // Query 1: all non-cancelled orders with a customer in the date range
        $orders = DB::table('orders')
            ->whereBetween('created_at', [$rangeStart, $rangeEnd])
            ->whereNotNull('customer_id')
            ->whereNotIn('status', ['cancelled'])
            ->select('customer_id', 'created_at')
            ->get();

        // Query 2: first-ever order date per customer (for all customers seen in the range)
        $customerIds = $orders->pluck('customer_id')->unique()->values();
        $firstOrderDates = $customerIds->isNotEmpty()
            ? DB::table('orders')
                ->whereIn('customer_id', $customerIds)
                ->whereNotIn('status', ['cancelled'])
                ->groupBy('customer_id')
                ->selectRaw('customer_id, MIN(created_at) as first_order_at')
                ->pluck('first_order_at', 'customer_id')
            : collect();

        // Build week buckets in PHP — O(orders × weeks), no additional queries
        $data = [];
        for ($i = $weeks - 1; $i >= 0; $i--) {
            $start = Carbon::now()->startOfWeek()->subWeeks($i);
            $end   = $start->copy()->endOfWeek();

            $seenThisWeek  = [];
            $newCount      = 0;
            $returningCount = 0;

            foreach ($orders as $order) {
                $orderDate = Carbon::parse($order->created_at);
                if (!$orderDate->between($start, $end)) continue;
                $cid = $order->customer_id;
                if (isset($seenThisWeek[$cid])) continue; // count each customer once per week
                $seenThisWeek[$cid] = true;

                $firstOrder = $firstOrderDates[$cid] ?? null;
                if ($firstOrder && Carbon::parse($firstOrder)->between($start, $end)) {
                    $newCount++;
                } else {
                    $returningCount++;
                }
            }

            $data[] = [
                'week'            => $start->format('M d'),
                'new'             => $newCount,
                'returning'       => $returningCount,
                'total_customers' => $newCount + $returningCount,
            ];
        }

        return response()->json(['retention' => $data]);
    }

    /**
     * Item profitability: revenue - cost per item.
     */
    public function profitability(Request $request): JsonResponse
    {
        $from = $request->query('from', Carbon::now()->startOfMonth()->toDateString());
        $to   = $request->query('to',   Carbon::now()->toDateString());

        $items = DB::table('order_items as oi')
            ->join('items as i', 'i.id', '=', 'oi.item_id')
            ->join('orders as o', 'o.id', '=', 'oi.order_id')
            ->whereBetween('o.created_at', [$from . ' 00:00:00', $to . ' 23:59:59'])
            ->whereNotIn('o.status', ['cancelled'])
            ->selectRaw('
                i.id,
                i.name,
                i.cost,
                SUM(oi.quantity) as total_qty,
                SUM(oi.total_price) as total_revenue,
                SUM(oi.quantity * COALESCE(i.cost, 0)) as total_cost
            ')
            ->groupBy('i.id', 'i.name', 'i.cost')
            ->orderByRaw('SUM(oi.total_price) DESC')
            ->limit(50)
            ->get();

        return response()->json([
            'from'  => $from,
            'to'    => $to,
            'items' => $items->map(fn($r) => [
                'id'              => $r->id,
                'name'            => $r->name,
                'total_qty'       => (int) $r->total_qty,
                'total_revenue'   => round((float) $r->total_revenue, 2),
                'total_cost'      => round((float) $r->total_cost, 2),
                'gross_profit'    => round((float) $r->total_revenue - (float) $r->total_cost, 2),
                'margin_pct'      => $r->total_revenue > 0
                    ? round(((float) $r->total_revenue - (float) $r->total_cost) / (float) $r->total_revenue * 100, 1)
                    : 0,
            ]),
        ]);
    }

    /**
     * Demand forecasting: average orders per day-of-week for next 7 days.
     */
    public function forecast(Request $request): JsonResponse
    {
        $lookbackDays = min((int) ($request->query('lookback', 90)), 365);

        // DAYOFWEEK: MySQL returns 1=Sun; normalise pgsql/sqlite to the same convention
        $dowExpr = match(DB::getDriverName()) {
            'sqlite'  => "CAST(strftime('%w', created_at) AS INTEGER) + 1",
            'pgsql'   => 'EXTRACT(DOW FROM created_at)::INTEGER + 1',
            default   => 'DAYOFWEEK(created_at)',
        };

        $avgByDow = DB::table('orders')
            ->where('created_at', '>=', now()->subDays($lookbackDays))
            ->whereNotIn('status', ['cancelled'])
            ->selectRaw("{$dowExpr} as dow, COUNT(*) as total, COUNT(DISTINCT DATE(created_at)) as day_count")
            ->groupByRaw($dowExpr)
            ->get()
            ->keyBy('dow');

        $forecast = [];
        for ($i = 0; $i < 7; $i++) {
            $date = Carbon::now()->addDays($i);
            $dow  = $date->dayOfWeek + 1; // MySQL DAYOFWEEK: 1=Sunday
            $row  = $avgByDow->get($dow);

            $avg = $row && $row->day_count > 0
                ? round($row->total / $row->day_count)
                : 0;

            $forecast[] = [
                'date'        => $date->toDateString(),
                'day'         => $date->format('D'),
                'avg_orders'  => $avg,
            ];
        }

        return response()->json(['forecast' => $forecast, 'lookback_days' => $lookbackDays]);
    }

    /**
     * Customer lifetime value overview.
     */
    public function customerLtv(Request $request): JsonResponse
    {
        $top = DB::table('orders as o')
            ->join('customers as c', 'c.id', '=', 'o.customer_id')
            ->whereNotNull('o.customer_id')
            ->whereNotIn('o.status', ['cancelled'])
            ->selectRaw('c.id, c.name, c.phone, COUNT(o.id) as order_count, SUM(o.total) as total_spent, MIN(o.created_at) as first_order, MAX(o.created_at) as last_order')
            ->groupBy('c.id', 'c.name', 'c.phone')
            ->orderByRaw('SUM(o.total) DESC')
            ->limit(20)
            ->get();

        return response()->json([
            'top_customers' => $top->map(fn($r) => [
                'id'          => $r->id,
                'name'        => $r->name,
                'phone'       => $r->phone,
                'order_count' => (int) $r->order_count,
                'total_spent' => round((float) $r->total_spent, 2),
                'first_order' => $r->first_order,
                'last_order'  => $r->last_order,
            ]),
        ]);
    }
}
