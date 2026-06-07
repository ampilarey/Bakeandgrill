<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Gst\Services\GstReportService;
use App\Domains\Payments\Services\PaymentCommissionService;
use App\Domains\Reporting\Support\ReportMoneySql;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Purchase;
use App\Models\Refund;
use App\Models\WasteLog;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class FinanceReportController extends Controller
{
    // ──────────────────────────────────────────────────────────
    // Profit & Loss
    // ──────────────────────────────────────────────────────────

    public function profitAndLoss(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseRange($request);

        // Revenue: completed / partially-refunded sales in the period (gross — before refunds)
        $revenue = Order::whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->selectRaw('COUNT(*) as orders')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TOTAL_LAAR) . ' as total')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TAX_LAAR) . ' as tax')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_DISCOUNT_LAAR) . ' as discount')
            ->first();

        // Refunds in the period — must subtract from gross or P&L overstates
        // by the entire refund amount. Excludes refunds marked rejected/pending
        // because those money is still with the merchant.
        $refundsTotal = (float) Refund::whereBetween('created_at', [$from, $to])
            ->whereIn('status', ['approved', 'processed', 'completed'])
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::REFUND_AMOUNT_LAAR) . ' as total')
            ->value('total');

        // COGS: received purchases in the period (exclude draft/cancelled POs)
        $cogs = Purchase::whereBetween('purchase_date', [$from->toDateString(), $to->toDateString()])
            ->whereIn('status', ['received', 'partial'])
            ->sum('total');

        // Operating expenses (use date strings — SQLite stores expense_date with time)
        $opex = Expense::whereDate('expense_date', '>=', $from->toDateString())
            ->whereDate('expense_date', '<=', $to->toDateString())
            ->where('status', 'approved')
            ->selectRaw('SUM(amount) as total, expense_category_id')
            ->with('category:id,name,icon')
            ->groupBy('expense_category_id')
            ->get();

        $opexTotal = (float) Expense::whereDate('expense_date', '>=', $from->toDateString())
            ->whereDate('expense_date', '<=', $to->toDateString())
            ->where('status', 'approved')
            ->sum('amount');

        // Waste cost
        $wasteCost = WasteLog::whereBetween('created_at', [$from, $to])->sum('cost_estimate');

        $commissionSummary = app(PaymentCommissionService::class)->paymentCommissionSummary($from, $to);
        $paymentProcessingFees = (float) ($commissionSummary['totals']['commission_total'] ?? 0);

        $grossRevenue = (float) ($revenue->total ?? 0);
        $netRevenue = round($grossRevenue - $refundsTotal, 2);
        $grossProfit = round($netRevenue - (float) $cogs, 2);
        // Bank commissions are auto-recorded as approved expenses — included in $opexTotal.
        $operatingProfit = round($grossProfit - $opexTotal - $wasteCost, 2);

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'revenue' => [
                'gross' => $grossRevenue,
                'refunds' => $refundsTotal,
                'tax' => (float) ($revenue->tax ?? 0),
                'discounts' => (float) ($revenue->discount ?? 0),
                'net' => $netRevenue,
                'orders' => (int) ($revenue->orders ?? 0),
            ],
            'cogs' => (float) $cogs,
            'gross_profit' => $grossProfit,
            'gross_margin_pct' => $netRevenue > 0 ? round($grossProfit / $netRevenue * 100, 2) : 0,
            'expenses' => [
                'total' => (float) $opexTotal,
                'by_category' => $opex->map(fn ($e) => [
                    'category' => $e->category?->name ?? 'Unknown',
                    'icon' => $e->category?->icon,
                    'total' => (float) $e->total,
                ]),
            ],
            'waste_cost' => (float) $wasteCost,
            'payment_processing_fees' => $paymentProcessingFees,
            'payment_commission' => $commissionSummary,
            'operating_profit' => $operatingProfit,
            'net_profit_margin_pct' => $netRevenue > 0 ? round($operatingProfit / $netRevenue * 100, 2) : 0,
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
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->selectRaw('DATE(created_at) as date')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TOTAL_LAAR) . ' as amount')
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
            ->whereIn('status', ['received', 'partial'])
            ->selectRaw('purchase_date as date, SUM(total) as amount')
            ->groupBy('purchase_date')
            ->orderBy('purchase_date')
            ->get()
            ->keyBy('date');

        // Build day-by-day series
        $days = [];
        $current = $from->copy();
        $runningBalance = 0.0;

        while ($current->lte($to)) {
            $dateKey = $current->toDateString();
            $in = (float) ($inflows[$dateKey]->amount ?? 0);
            $expenses = (float) ($expenseByDay[$dateKey]->amount ?? 0);
            $purchases = (float) ($purchaseByDay[$dateKey]->amount ?? 0);
            $out = $expenses + $purchases;
            $net = $in - $out;
            $runningBalance += $net;

            $days[] = [
                'date' => $dateKey,
                'inflow' => $in,
                'outflow' => $out,
                'net' => round($net, 2),
                'running_balance' => round($runningBalance, 2),
            ];

            $current->addDay();
        }

        $totalInflow = array_sum(array_column($days, 'inflow'));
        $totalOutflow = array_sum(array_column($days, 'outflow'));

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'total_inflow' => round($totalInflow, 2),
            'total_outflow' => round($totalOutflow, 2),
            'net_cash_flow' => round($totalInflow - $totalOutflow, 2),
            'days' => $days,
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Tax report (GST / TGST)
    // ──────────────────────────────────────────────────────────

    public function taxReport(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseRange($request);

        return response()->json(
            app(GstReportService::class)->legacyTaxSummary($from->toDateString(), $to->toDateString()),
        );
    }

    // ──────────────────────────────────────────────────────────
    // Daily summary
    // ──────────────────────────────────────────────────────────

    public function dailySummary(Request $request): JsonResponse
    {
        $request->validate(['date' => 'nullable|date_format:Y-m-d']);
        $date = $request->query('date', now()->toDateString());
        $from = Carbon::parse($date)->startOfDay();
        $to = Carbon::parse($date)->endOfDay();

        $orders = Order::whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES);
        $orderCount = (clone $orders)->count();
        $revenue = (float) (clone $orders)
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TOTAL_LAAR) . ' as total')
            ->value('total');
        $tax = (float) (clone $orders)
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TAX_LAAR) . ' as total')
            ->value('total');
        $discounts = (float) (clone $orders)
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_DISCOUNT_LAAR) . ' as total')
            ->value('total');
        $avgOrder = $orderCount > 0 ? round($revenue / $orderCount, 2) : 0;

        $refundsTotal = (float) Refund::whereBetween('created_at', [$from, $to])
            ->whereIn('status', ['approved', 'processed', 'completed'])
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::REFUND_AMOUNT_LAAR) . ' as total')
            ->value('total');
        $netRevenue = round($revenue - $refundsTotal, 2);

        $expenses = (float) Expense::whereDate('expense_date', $date)->where('status', 'approved')->sum('amount');
        $purchases = (float) Purchase::whereDate('purchase_date', $date)
            ->whereIn('status', ['received', 'partial'])
            ->sum('total');
        $wasteCost = (float) WasteLog::whereBetween('created_at', [$from, $to])->sum('cost_estimate');

        $commissionSummary = app(PaymentCommissionService::class)->paymentCommissionSummary($from, $to);
        $paymentProcessingFees = (float) ($commissionSummary['totals']['commission_total'] ?? 0);

        $profit = round($netRevenue - $expenses - $purchases - $wasteCost, 2);

        $totalLaar = ReportMoneySql::ORDER_TOTAL_LAAR;

        // Orders by type / channel
        $byType = Order::whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->selectRaw('orders.type as order_type, COUNT(*) as count')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr($totalLaar) . ' as revenue')
            ->groupBy('type')
            ->get();

        // Top items
        $topItems = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('items', 'items.id', '=', 'order_items.item_id')
            ->whereBetween('orders.created_at', [$from, $to])
            ->whereIn('orders.status', ReportMoneySql::SALE_STATUSES)
            ->selectRaw('items.name, SUM(order_items.quantity) as qty, SUM(order_items.quantity * order_items.unit_price) as revenue')
            ->groupBy('items.id', 'items.name')
            ->orderByDesc('qty')
            ->limit(10)
            ->get();

        return response()->json([
            'date' => $date,
            'revenue' => $revenue,
            'refunds' => $refundsTotal,
            'net_revenue' => $netRevenue,
            'tax' => $tax,
            'discounts' => $discounts,
            'orders' => $orderCount,
            'avg_order' => $avgOrder,
            'expenses' => $expenses,
            'purchases' => $purchases,
            'waste_cost' => $wasteCost,
            'payment_processing_fees' => $paymentProcessingFees,
            'payment_commission' => $commissionSummary,
            'net_profit' => $profit,
            'by_type' => $byType->map(fn ($r) => [
                'type' => $r->order_type ?? 'unknown',
                'count' => (int) $r->count,
                'revenue' => (float) $r->revenue,
            ]),
            'top_items' => $topItems->map(fn ($r) => [
                'name' => $r->name,
                'qty' => (float) $r->qty,
                'revenue' => (float) $r->revenue,
            ]),
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Accounts payable
    // ──────────────────────────────────────────────────────────

    public function accountsPayable(Request $request): JsonResponse
    {
        $limit = 500;

        // Aggregate totals from the full table (cheap index scan — no row hydration).
        $totals = Invoice::where('type', 'purchase')
            ->whereIn('status', ['draft', 'sent', 'overdue'])
            ->selectRaw('SUM(total) as total_outstanding, COUNT(CASE WHEN status = ? THEN 1 END) as overdue_count', ['overdue'])
            ->first();

        $unpaid = Invoice::where('type', 'purchase')
            ->whereIn('status', ['draft', 'sent', 'overdue'])
            ->with(['supplier:id,name,phone', 'purchase:id,purchase_number'])
            ->orderBy('due_date')
            ->limit($limit + 1) // fetch one extra to detect truncation
            ->get();

        $truncated = $unpaid->count() > $limit;
        if ($truncated) {
            $unpaid = $unpaid->take($limit);
        }

        $today = now()->toDateString();

        return response()->json([
            'total_outstanding' => round((float) ($totals->total_outstanding ?? 0), 2),
            'overdue_count' => (int) ($totals->overdue_count ?? 0),
            'truncated' => $truncated,
            'items' => $unpaid->map(fn ($inv) => [
                'id' => $inv->id,
                'invoice_number' => $inv->invoice_number,
                'supplier' => $inv->supplier ? ['id' => $inv->supplier->id, 'name' => $inv->supplier->name, 'phone' => $inv->supplier->phone] : null,
                'purchase' => $inv->purchase ? ['id' => $inv->purchase->id, 'number' => $inv->purchase->purchase_number] : null,
                'total' => (float) $inv->total,
                'due_date' => $inv->due_date?->toDateString(),
                'days_overdue' => $inv->due_date && $inv->due_date->toDateString() < $today
                    ? (int) $inv->due_date->diffInDays(now())
                    : 0,
                'status' => $inv->status,
            ]),
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Accounts receivable
    // ──────────────────────────────────────────────────────────

    public function accountsReceivable(Request $request): JsonResponse
    {
        $limit = 500;

        $totals = Invoice::where('type', 'sale')
            ->whereIn('status', ['sent', 'overdue'])
            ->selectRaw('SUM(CASE WHEN total_laar > amount_paid_laar THEN total_laar - amount_paid_laar ELSE 0 END) as total_outstanding, COUNT(CASE WHEN status = ? THEN 1 END) as overdue_count', ['overdue'])
            ->first();

        $unpaid = Invoice::where('type', 'sale')
            ->whereIn('status', ['sent', 'overdue'])
            ->with(['customer:id,name,phone'])
            ->orderBy('due_date')
            ->limit($limit + 1)
            ->get();

        $truncated = $unpaid->count() > $limit;
        if ($truncated) {
            $unpaid = $unpaid->take($limit);
        }

        $today = now()->toDateString();

        return response()->json([
            'total_outstanding' => round((float) ($totals->total_outstanding ?? 0) / 100, 2),
            'overdue_count' => (int) ($totals->overdue_count ?? 0),
            'truncated' => $truncated,
            'items' => $unpaid->map(fn ($inv) => [
                'id' => $inv->id,
                'invoice_number' => $inv->invoice_number,
                'customer' => $inv->customer ? ['id' => $inv->customer->id, 'name' => $inv->customer->name, 'phone' => $inv->customer->phone] : null,
                'total' => round($inv->balanceDueLaar() / 100, 2),
                'invoice_total' => (float) $inv->total,
                'amount_paid' => round((int) ($inv->amount_paid_laar ?? 0) / 100, 2),
                'due_date' => $inv->due_date?->toDateString(),
                'days_overdue' => $inv->due_date && $inv->due_date->toDateString() < $today
                    ? (int) $inv->due_date->diffInDays(now())
                    : 0,
                'status' => $inv->status,
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
