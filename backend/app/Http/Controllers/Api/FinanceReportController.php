<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Expense;
use App\Models\Invoice;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\Purchase;
use App\Models\WasteLog;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;

class FinanceReportController extends Controller
{
    // ──────────────────────────────────────────────────────────
    // Profit & Loss
    // ──────────────────────────────────────────────────────────

    public function profitAndLoss(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseRange($request);

        // Revenue: completed orders
        $revenue = Order::whereBetween('created_at', [$from, $to])
            ->where('status', 'completed')
            ->selectRaw('SUM(total) as total, SUM(tax_amount) as tax, SUM(discount_amount) as discount, COUNT(*) as orders')
            ->first();

        // COGS: purchase costs in the period
        $cogs = Purchase::whereBetween('purchase_date', [$from->toDateString(), $to->toDateString()])
            ->sum('total');

        // Operating expenses
        $opex = Expense::whereBetween('expense_date', [$from->toDateString(), $to->toDateString()])
            ->where('status', 'approved')
            ->selectRaw('SUM(amount) as total, expense_category_id')
            ->with('category:id,name,icon')
            ->groupBy('expense_category_id')
            ->get();

        $opexTotal = $opex->sum('total');

        // Waste cost
        $wasteCost = WasteLog::whereBetween('created_at', [$from, $to])->sum('cost_estimate');

        $grossRevenue   = (float) ($revenue->total ?? 0);
        $grossProfit    = round($grossRevenue - (float) $cogs, 2);
        $operatingProfit = round($grossProfit - $opexTotal - $wasteCost, 2);

        return response()->json([
            'from' => $from->toDateString(),
            'to'   => $to->toDateString(),
            'revenue' => [
                'gross'     => $grossRevenue,
                'tax'       => (float) ($revenue->tax ?? 0),
                'discounts' => (float) ($revenue->discount ?? 0),
                'net'       => round($grossRevenue - (float) ($revenue->tax ?? 0), 2),
                'orders'    => (int) ($revenue->orders ?? 0),
            ],
            'cogs'          => (float) $cogs,
            'gross_profit'  => $grossProfit,
            'gross_margin_pct' => $grossRevenue > 0 ? round($grossProfit / $grossRevenue * 100, 2) : 0,
            'expenses' => [
                'total'       => (float) $opexTotal,
                'by_category' => $opex->map(fn($e) => [
                    'category' => $e->category?->name ?? 'Unknown',
                    'icon'     => $e->category?->icon,
                    'total'    => (float) $e->total,
                ]),
            ],
            'waste_cost'          => (float) $wasteCost,
            'operating_profit'    => $operatingProfit,
            'net_profit_margin_pct'=> $grossRevenue > 0 ? round($operatingProfit / $grossRevenue * 100, 2) : 0,
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Cash-flow report
    // ──────────────────────────────────────────────────────────

    public function cashFlow(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseRange($request);

        // Inflows: completed order revenue by day
        $inflows = Order::whereBetween('created_at', [$from, $to])
            ->where('status', 'completed')
            ->selectRaw("DATE(created_at) as date, SUM(total) as amount")
            ->groupBy('date')
            ->orderBy('date')
            ->get()
            ->keyBy('date');

        // Outflows: expenses + purchases by day
        $expenseByDay = Expense::whereBetween('expense_date', [$from->toDateString(), $to->toDateString()])
            ->where('status', 'approved')
            ->selectRaw('expense_date as date, SUM(amount) as amount')
            ->groupBy('expense_date')
            ->orderBy('expense_date')
            ->get()
            ->keyBy('date');

        $purchaseByDay = Purchase::whereBetween('purchase_date', [$from->toDateString(), $to->toDateString()])
            ->selectRaw('purchase_date as date, SUM(total) as amount')
            ->groupBy('purchase_date')
            ->orderBy('purchase_date')
            ->get()
            ->keyBy('date');

        // Build day-by-day series
        $days    = [];
        $current = $from->copy();
        $runningBalance = 0.0;

        while ($current->lte($to)) {
            $dateKey  = $current->toDateString();
            $in       = (float) ($inflows[$dateKey]->amount ?? 0);
            $expenses = (float) ($expenseByDay[$dateKey]->amount ?? 0);
            $purchases = (float) ($purchaseByDay[$dateKey]->amount ?? 0);
            $out      = $expenses + $purchases;
            $net      = $in - $out;
            $runningBalance += $net;

            $days[] = [
                'date'            => $dateKey,
                'inflow'          => $in,
                'outflow'         => $out,
                'net'             => round($net, 2),
                'running_balance' => round($runningBalance, 2),
            ];

            $current->addDay();
        }

        $totalInflow  = array_sum(array_column($days, 'inflow'));
        $totalOutflow = array_sum(array_column($days, 'outflow'));

        return response()->json([
            'from'          => $from->toDateString(),
            'to'            => $to->toDateString(),
            'total_inflow'  => round($totalInflow, 2),
            'total_outflow' => round($totalOutflow, 2),
            'net_cash_flow' => round($totalInflow - $totalOutflow, 2),
            'days'          => $days,
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Tax report (GST / TGST)
    // ──────────────────────────────────────────────────────────

    public function taxReport(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseRange($request);

        $monthExpr = match(DB::getDriverName()) {
            'sqlite'  => "strftime('%Y-%m', created_at)",
            'pgsql'   => "TO_CHAR(created_at, 'YYYY-MM')",
            default   => 'DATE_FORMAT(created_at, "%Y-%m")',
        };

        $taxable = Order::whereBetween('created_at', [$from, $to])
            ->where('status', 'completed')
            ->where('tax_amount', '>', 0)
            ->selectRaw("{$monthExpr} as period, SUM(subtotal) as taxable_amount, SUM(tax_amount) as tax_collected, COUNT(*) as transactions")
            ->groupByRaw($monthExpr)
            ->orderByRaw($monthExpr)
            ->get();

        $totalTaxable   = $taxable->sum('taxable_amount');
        $totalCollected = $taxable->sum('tax_collected');

        // Input tax on purchases (if tracked on invoice)
        $inputTax = Invoice::where('type', 'purchase')
            ->whereBetween('issue_date', [$from->toDateString(), $to->toDateString()])
            ->where('status', '!=', 'void')
            ->sum('tax_amount');

        return response()->json([
            'from'           => $from->toDateString(),
            'to'             => $to->toDateString(),
            'output_tax'     => [
                'taxable_revenue' => (float) $totalTaxable,
                'tax_collected'   => (float) $totalCollected,
                'by_period'       => $taxable->map(fn($r) => [
                    'period'           => $r->period,
                    'taxable_amount'   => (float) $r->taxable_amount,
                    'tax_collected'    => (float) $r->tax_collected,
                    'transactions'     => (int) $r->transactions,
                ]),
            ],
            'input_tax'      => (float) $inputTax,
            'net_tax_payable'=> round((float) $totalCollected - (float) $inputTax, 2),
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Daily summary
    // ──────────────────────────────────────────────────────────

    public function dailySummary(Request $request): JsonResponse
    {
        $date = $request->query('date', now()->toDateString());
        $from = Carbon::parse($date)->startOfDay();
        $to   = Carbon::parse($date)->endOfDay();

        $orders = Order::whereBetween('created_at', [$from, $to])->where('status', 'completed');
        $orderCount = (clone $orders)->count();
        $revenue    = (float) (clone $orders)->sum('total');
        $tax        = (float) (clone $orders)->sum('tax_amount');
        $discounts  = (float) (clone $orders)->sum('discount_amount');
        $avgOrder   = $orderCount > 0 ? round($revenue / $orderCount, 2) : 0;

        $expenses   = (float) Expense::whereDate('expense_date', $date)->where('status', 'approved')->sum('amount');
        $purchases  = (float) Purchase::whereDate('purchase_date', $date)->sum('total');
        $wasteCost  = (float) WasteLog::whereBetween('created_at', [$from, $to])->sum('cost_estimate');

        $profit = round($revenue - $expenses - $purchases - $wasteCost, 2);

        // Orders by type / channel
        $byType = Order::whereBetween('created_at', [$from, $to])
            ->where('status', 'completed')
            ->selectRaw('orders.type as order_type, COUNT(*) as count, SUM(total) as revenue')
            ->groupBy('type')
            ->get();

        // Top items
        $topItems = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('items', 'items.id', '=', 'order_items.item_id')
            ->whereBetween('orders.created_at', [$from, $to])
            ->where('orders.status', 'completed')
            ->selectRaw('items.name, SUM(order_items.quantity) as qty, SUM(order_items.quantity * order_items.unit_price) as revenue')
            ->groupBy('items.id', 'items.name')
            ->orderByDesc('qty')
            ->limit(10)
            ->get();

        return response()->json([
            'date'       => $date,
            'revenue'    => $revenue,
            'tax'        => $tax,
            'discounts'  => $discounts,
            'orders'     => $orderCount,
            'avg_order'  => $avgOrder,
            'expenses'   => $expenses,
            'purchases'  => $purchases,
            'waste_cost' => $wasteCost,
            'net_profit' => $profit,
            'by_type'    => $byType->map(fn($r) => [
                'type'    => $r->order_type ?? 'unknown',
                'count'   => (int) $r->count,
                'revenue' => (float) $r->revenue,
            ]),
            'top_items' => $topItems->map(fn($r) => [
                'name'    => $r->name,
                'qty'     => (float) $r->qty,
                'revenue' => (float) $r->revenue,
            ]),
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Accounts payable
    // ──────────────────────────────────────────────────────────

    public function accountsPayable(Request $request): JsonResponse
    {
        $unpaid = Invoice::where('type', 'purchase')
            ->whereIn('status', ['draft', 'sent', 'overdue'])
            ->with(['supplier:id,name,phone', 'purchase:id,purchase_number'])
            ->orderBy('due_date')
            ->get();

        $today = now()->toDateString();

        return response()->json([
            'total_outstanding' => round($unpaid->sum('total'), 2),
            'overdue_count'     => $unpaid->where('status', 'overdue')->count(),
            'items'             => $unpaid->map(fn($inv) => [
                'id'             => $inv->id,
                'invoice_number' => $inv->invoice_number,
                'supplier'       => $inv->supplier ? ['id' => $inv->supplier->id, 'name' => $inv->supplier->name, 'phone' => $inv->supplier->phone] : null,
                'purchase'       => $inv->purchase ? ['id' => $inv->purchase->id, 'number' => $inv->purchase->purchase_number] : null,
                'total'          => (float) $inv->total,
                'due_date'       => $inv->due_date?->toDateString(),
                'days_overdue'   => $inv->due_date && $inv->due_date->toDateString() < $today
                    ? (int) $inv->due_date->diffInDays(now())
                    : 0,
                'status'         => $inv->status,
            ]),
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Accounts receivable
    // ──────────────────────────────────────────────────────────

    public function accountsReceivable(Request $request): JsonResponse
    {
        $unpaid = Invoice::where('type', 'sale')
            ->whereIn('status', ['sent', 'overdue'])
            ->with(['customer:id,name,phone'])
            ->orderBy('due_date')
            ->get();

        $today = now()->toDateString();

        return response()->json([
            'total_outstanding' => round($unpaid->sum('total'), 2),
            'overdue_count'     => $unpaid->where('status', 'overdue')->count(),
            'items'             => $unpaid->map(fn($inv) => [
                'id'             => $inv->id,
                'invoice_number' => $inv->invoice_number,
                'customer'       => $inv->customer ? ['id' => $inv->customer->id, 'name' => $inv->customer->name, 'phone' => $inv->customer->phone] : null,
                'total'          => (float) $inv->total,
                'due_date'       => $inv->due_date?->toDateString(),
                'days_overdue'   => $inv->due_date && $inv->due_date->toDateString() < $today
                    ? (int) $inv->due_date->diffInDays(now())
                    : 0,
                'status'         => $inv->status,
            ]),
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Helper
    // ──────────────────────────────────────────────────────────

    private function parseRange(Request $request): array
    {
        try {
            $from = $request->query('from')
                ? Carbon::createFromFormat('Y-m-d', $request->query('from'))->startOfDay()
                : now()->startOfMonth()->startOfDay();
            $to = $request->query('to')
                ? Carbon::createFromFormat('Y-m-d', $request->query('to'))->endOfDay()
                : now()->endOfDay();
        } catch (\Throwable) {
            throw ValidationException::withMessages([
                'from' => ['Invalid date format. Use YYYY-MM-DD.'],
            ]);
        }

        if ($to->lessThan($from)) {
            throw ValidationException::withMessages([
                'to' => ['End date must be after start date.'],
            ]);
        }

        // Cap to 365 days to prevent memory/timeout issues
        if ($from->diffInDays($to) > 365) {
            $to = $from->copy()->addDays(365)->endOfDay();
        }

        return [$from, $to];
    }
}
