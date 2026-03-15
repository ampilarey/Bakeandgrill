<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\InventoryItem;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class ForecastController extends Controller
{
    // ──────────────────────────────────────────────────────────
    // Revenue forecast: weighted moving average over past N weeks
    // ──────────────────────────────────────────────────────────

    public function revenueForecast(Request $request): JsonResponse
    {
        $weeks   = (int) $request->query('weeks', 4);
        $weeks   = min(max($weeks, 2), 52);
        $horizon = (int) $request->query('horizon', 4); // weeks to forecast ahead

        // Collect weekly revenue totals from last $weeks * 2 weeks
        $ywExpr = match(DB::getDriverName()) {
            'sqlite'  => "strftime('%Y', created_at) || strftime('%W', created_at)",
            'pgsql'   => "TO_CHAR(created_at, 'IYYYIW')",
            default   => 'YEARWEEK(created_at, 1)',
        };

        $history = DB::table('orders')
            ->where('status', 'completed')
            ->where('created_at', '>=', now()->subWeeks($weeks * 2))
            ->selectRaw("{$ywExpr} as yw, SUM(total) as revenue, COUNT(*) as orders")
            ->groupByRaw($ywExpr)
            ->orderByRaw($ywExpr)
            ->get();

        if ($history->count() < 2) {
            return response()->json([
                'insufficient_data'  => true,
                'message'            => 'Not enough sales history yet. Need at least 2 weeks of completed orders.',
                'history'            => [],
                'weighted_moving_avg'=> 0,
                'growth_rate_pct'    => 0,
                'forecast'           => [],
            ]);
        }

        $values  = $history->pluck('revenue')->map(fn($v) => (float) $v)->values()->toArray();
        $weights = $this->decayWeights(count($values));

        $wma  = $this->weightedMovingAverage($values, $weights);
        $growth = $this->estimateGrowthRate($values);

        $forecast = [];
        $lastYw   = (int) $history->last()->yw;
        $baseDate = $this->ywToMonday($lastYw);

        for ($i = 1; $i <= $horizon; $i++) {
            $projected = round($wma * pow(1 + $growth, $i), 2);
            $weekStart = $baseDate->copy()->addWeeks($i);
            $forecast[] = [
                'week_start' => $weekStart->toDateString(),
                'week_end'   => $weekStart->copy()->addDays(6)->toDateString(),
                'projected_revenue' => $projected,
            ];
        }

        return response()->json([
            'history' => $history->map(fn($r) => [
                'yearweek' => $r->yw,
                'revenue'  => (float) $r->revenue,
                'orders'   => (int) $r->orders,
            ]),
            'weighted_moving_avg' => round($wma, 2),
            'growth_rate_pct'     => round($growth * 100, 2),
            'forecast'            => $forecast,
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Item-level demand forecast
    // ──────────────────────────────────────────────────────────

    public function itemForecast(Request $request): JsonResponse
    {
        $days    = (int) $request->query('lookback_days', 28);
        $horizon = (int) $request->query('horizon_days', 7);
        $limit   = (int) $request->query('limit', 20);

        $sales = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('items', 'items.id', '=', 'order_items.item_id')
            ->where('orders.status', 'completed')
            ->where('orders.created_at', '>=', now()->subDays($days))
            ->selectRaw('items.id, items.name, SUM(order_items.quantity) as total_qty, COUNT(DISTINCT DATE(orders.created_at)) as sale_days')
            ->groupBy('items.id', 'items.name')
            ->orderByDesc('total_qty')
            ->limit($limit)
            ->get();

        return response()->json([
            'lookback_days' => $days,
            'horizon_days'  => $horizon,
            'items' => $sales->map(fn($r) => [
                'item_id'           => $r->id,
                'item_name'         => $r->name,
                'total_qty_sold'    => (float) $r->total_qty,
                'avg_daily_demand'  => round((float) $r->total_qty / max($r->sale_days, 1), 2),
                'projected_demand'  => round((float) $r->total_qty / max($r->sale_days, 1) * $horizon, 2),
            ]),
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Sales trend: daily/weekly/monthly aggregation
    // ──────────────────────────────────────────────────────────

    public function salesTrends(Request $request): JsonResponse
    {
        $granularity = $request->query('granularity', 'daily'); // daily|weekly|monthly
        $from = Carbon::parse($request->query('from', now()->subDays(29)->toDateString()));
        $to   = Carbon::parse($request->query('to',   now()->toDateString()));

        // Never go beyond 1 year back; cap the range at 12 months
        $from = max($from, now()->subYear());
        if ($to->diffInDays($from) > 366) {
            return response()->json(['message' => 'Date range cannot exceed 1 year.'], 422);
        }

        $from = $from->toDateString();
        $to   = $to->toDateString();

        $driver = DB::getDriverName();
        $periodExpr = match ($granularity) {
            'weekly' => match ($driver) {
                'sqlite'  => "strftime('%Y-W', created_at) || strftime('%W', created_at)",
                'pgsql'   => "TO_CHAR(created_at, 'IYYY-\"W\"IW')",
                default   => "DATE_FORMAT(created_at, '%x-W%v')",
            },
            'monthly' => match ($driver) {
                'sqlite'  => "strftime('%Y-%m', created_at)",
                'pgsql'   => "TO_CHAR(created_at, 'YYYY-MM')",
                default   => "DATE_FORMAT(created_at, '%Y-%m')",
            },
            default => match ($driver) {
                'sqlite'  => "strftime('%Y-%m-%d', created_at)",
                'pgsql'   => "TO_CHAR(created_at, 'YYYY-MM-DD')",
                default   => "DATE_FORMAT(created_at, '%Y-%m-%d')",
            },
        };

        $data = DB::table('orders')
            ->where('status', 'completed')
            ->whereBetween('created_at', ["{$from} 00:00:00", "{$to} 23:59:59"])
            ->selectRaw("{$periodExpr} as period, SUM(total) as revenue, COUNT(*) as orders, AVG(total) as avg_order")
            ->groupByRaw($periodExpr)
            ->orderByRaw($periodExpr)
            ->get();

        // Compute period-on-period growth
        $items   = $data->values();
        $withGrowth = $items->map(function ($row, $idx) use ($items) {
            $prev   = $idx > 0 ? (float) $items[$idx - 1]->revenue : null;
            $curr   = (float) $row->revenue;
            $growth = $prev && $prev > 0 ? round(($curr - $prev) / $prev * 100, 2) : null;

            return [
                'period'     => $row->period,
                'revenue'    => $curr,
                'orders'     => (int) $row->orders,
                'avg_order'  => round((float) $row->avg_order, 2),
                'growth_pct' => $growth,
            ];
        });

        $totalRevenue = $items->sum('revenue');
        $totalOrders  = $items->sum('orders');

        return response()->json([
            'from'          => $from,
            'to'            => $to,
            'granularity'   => $granularity,
            'total_revenue' => round((float) $totalRevenue, 2),
            'total_orders'  => (int) $totalOrders,
            'avg_per_period'=> count($items) > 0 ? round((float) $totalRevenue / count($items), 2) : 0,
            'data'          => $withGrowth,
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Inventory consumption rate + days-of-stock remaining
    // ──────────────────────────────────────────────────────────

    public function inventoryForecast(Request $request): JsonResponse
    {
        $days = (int) $request->query('lookback_days', 30);

        $movements = DB::table('stock_movements')
            ->where('type', 'deduction')
            ->where('created_at', '>=', now()->subDays($days))
            ->where('quantity', '<', 0)
            ->selectRaw('inventory_item_id, SUM(ABS(quantity)) as consumed')
            ->groupBy('inventory_item_id')
            ->get()
            ->keyBy('inventory_item_id');

        $items = InventoryItem::where('is_active', true)
            ->with('category:id,name')
            ->get();

        return response()->json([
            'lookback_days' => $days,
            'items' => $items->map(function ($item) use ($movements, $days) {
                $consumed    = (float) ($movements[$item->id]->consumed ?? 0);
                $dailyRate   = $days > 0 ? round($consumed / $days, 4) : 0;
                $stock       = (float) ($item->current_stock ?? 0);
                $daysLeft    = $dailyRate > 0 ? (int) floor($stock / $dailyRate) : null;

                return [
                    'id'               => $item->id,
                    'name'             => $item->name,
                    'unit'             => $item->unit,
                    'category'         => $item->category?->name,
                    'current_stock'    => $stock,
                    'reorder_point'    => (float) ($item->reorder_point ?? 0),
                    'daily_usage_rate' => $dailyRate,
                    'days_of_stock'    => $daysLeft,
                    'status'           => $this->stockStatus($stock, (float) ($item->reorder_point ?? 0), $daysLeft),
                ];
            })->sortBy('days_of_stock')->values(),
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────

    private function weightedMovingAverage(array $values, array $weights): float
    {
        $n = count($values);
        $sum = 0.0;
        $wSum = 0.0;

        for ($i = 0; $i < $n; $i++) {
            $sum  += $values[$i] * $weights[$i];
            $wSum += $weights[$i];
        }

        return $wSum > 0 ? $sum / $wSum : 0;
    }

    private function decayWeights(int $n): array
    {
        // Linear decay: newest week has highest weight
        $weights = [];
        for ($i = 1; $i <= $n; $i++) {
            $weights[] = $i;
        }
        return $weights;
    }

    private function estimateGrowthRate(array $values): float
    {
        $n = count($values);
        if ($n < 2) return 0.0;

        $firstHalf  = array_slice($values, 0, (int) floor($n / 2));
        $secondHalf = array_slice($values, (int) floor($n / 2));

        $avg1 = array_sum($firstHalf) / count($firstHalf);
        $avg2 = array_sum($secondHalf) / count($secondHalf);

        if ($avg1 <= 0) return 0.0;

        return ($avg2 - $avg1) / $avg1 / max(1, count($firstHalf));
    }

    private function ywToMonday(int $yw): \Carbon\Carbon
    {
        $year = (int) floor($yw / 100);
        $week = $yw % 100;
        return \Carbon\Carbon::now()->setISODate($year, $week)->startOfWeek();
    }

    private function stockStatus(float $stock, float $reorder, ?int $daysLeft): string
    {
        if ($stock <= 0)         return 'out_of_stock';
        if ($stock <= $reorder)  return 'critical';
        if ($daysLeft !== null && $daysLeft <= 3) return 'low';
        if ($daysLeft !== null && $daysLeft <= 7) return 'warning';
        return 'ok';
    }
}
