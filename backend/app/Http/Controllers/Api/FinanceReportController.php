<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Gst\Services\GstReportService;
use App\Domains\Payments\Services\PaymentCommissionService;
use App\Domains\Reporting\Services\BreakEvenService;
use App\Domains\Reporting\Support\PurchaseSpendQuery;
use App\Domains\Reporting\Support\ReportMoneySql;
use App\Domains\Trade\Services\WholesaleChannelAggregator;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Purchase;
use App\Models\Refund;
use App\Models\Shift;
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

        /*
         * COGS: the value of what actually arrived, not what was ordered.
         *
         * This summed `purchases.total` over `received`/`partial` orders,
         * which counted a part delivery at its full ordered price and dropped
         * a short-closed one to nothing (owner, 2026-09-06). See
         * PurchaseSpendQuery.
         */
        $cogs = PurchaseSpendQuery::total($from->toDateString(), $to->toDateString());

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

        $wholesale = app(WholesaleChannelAggregator::class)->summary($from, $to);
        $wholesaleWasteLaar = app(WholesaleChannelAggregator::class)->wasteCostLaar($from, $to);
        $wholesaleRevenue = (float) $wholesale['revenue'];
        $wholesaleCogs = (float) $wholesale['cogs'];
        $wholesaleWaste = round($wholesaleWasteLaar / 100, 2);

        $grossRevenue = (float) ($revenue->total ?? 0);
        $outputTax = (float) ($revenue->tax ?? 0);
        /*
         * Output GST is money collected for MIRA, not income — it was shown as
         * a line here but never subtracted, so every profit figure carried the
         * whole 8% as if the shop kept it. Owner, 2026-09-06: "gst not return
         * in cafe" — nothing offsets it on the cost side either, so it has to
         * come out of revenue before any profit is claimed.
         */
        $netRevenue = round($grossRevenue - $outputTax - $refundsTotal, 2);
        $wholesaleNet = round($wholesaleRevenue - (float) $wholesale['tax'], 2);
        // Retail keys stay order/purchase based; combined profit includes wholesale channel.
        $combinedNet = round($netRevenue + $wholesaleNet, 2);
        $grossProfit = round($combinedNet - (float) $cogs - $wholesaleCogs, 2);
        // Bank commissions are auto-recorded as approved expenses — included in $opexTotal.
        /*
         * Waste is NOT subtracted. Under purchases-as-cost accounting (the
         * owner's model, 2026-09-06) the wasted ingredients were already paid
         * for inside the purchase figures — subtracting their estimated value
         * again counted the same money twice. It stays in the payload as an
         * information line: worth watching, already paid for.
         */
        $operatingProfit = round($grossProfit - $opexTotal, 2);

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'revenue' => [
                'gross' => $grossRevenue,
                'refunds' => $refundsTotal,
                'tax' => $outputTax,
                'discounts' => (float) ($revenue->discount ?? 0),
                'net' => $netRevenue,
                'orders' => (int) ($revenue->orders ?? 0),
                'wholesale' => $wholesaleRevenue,
                'wholesale_tax' => (float) $wholesale['tax'],
                'combined_net' => $combinedNet,
            ],
            'cogs' => (float) $cogs,
            'wholesale_cogs' => $wholesaleCogs,
            'wholesale' => $wholesale,
            'gross_profit' => $grossProfit,
            'gross_margin_pct' => $combinedNet > 0 ? round($grossProfit / $combinedNet * 100, 2) : 0,
            'expenses' => [
                'total' => (float) $opexTotal,
                'by_category' => $opex->map(fn ($e) => [
                    'category' => $e->category?->name ?? 'Unknown',
                    'icon' => $e->category?->icon,
                    'total' => (float) $e->total,
                ]),
            ],
            'waste_cost' => (float) $wasteCost,
            'wholesale_waste_cost' => $wholesaleWaste,
            'payment_processing_fees' => $paymentProcessingFees,
            'payment_commission' => $commissionSummary,
            'operating_profit' => $operatingProfit,
            'net_profit_margin_pct' => $combinedNet > 0 ? round($operatingProfit / $combinedNet * 100, 2) : 0,
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Break-even estimate
    // ──────────────────────────────────────────────────────────

    /**
     * Seed data for the admin break-even calculator: the trailing window's
     * GST-exclusive revenue, variable cost, fixed cost and the break-even
     * those imply. Everything is a starting point the owner overrides in the
     * UI — see BreakEvenService and AUDIT_FINANCE_2026-08-26.md.
     */
    public function breakEven(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseRange($request);

        return response()->json(app(BreakEvenService::class)->estimate($from, $to));
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

        // What left the bank, on the day the goods came.
        $purchaseByDay = PurchaseSpendQuery::byDay($from->toDateString(), $to->toDateString());

        // Build day-by-day series
        $days = [];
        $current = $from->copy();
        $runningBalance = 0.0;

        while ($current->lte($to)) {
            $dateKey = $current->toDateString();
            $in = (float) ($inflows[$dateKey]->amount ?? 0);
            $expenses = (float) ($expenseByDay[$dateKey]->amount ?? 0);
            $purchases = (float) ($purchaseByDay[$dateKey] ?? 0);
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

        $wholesaleByDay = app(WholesaleChannelAggregator::class)->revenueByDay($from, $to);
        foreach ($days as &$day) {
            $day['wholesale_inflow'] = (float) ($wholesaleByDay[$day['date']] ?? 0);
        }
        unset($day);

        $totalInflow = array_sum(array_column($days, 'inflow'));
        $totalWholesaleInflow = array_sum(array_column($days, 'wholesale_inflow'));
        $totalOutflow = array_sum(array_column($days, 'outflow'));

        return response()->json([
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'total_inflow' => round($totalInflow, 2),
            'total_wholesale_inflow' => round($totalWholesaleInflow, 2),
            'total_outflow' => round($totalOutflow, 2),
            'net_cash_flow' => round($totalInflow + $totalWholesaleInflow - $totalOutflow, 2),
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
        // Net of the output GST handed to MIRA — collected, not earned.
        $netRevenue = round($revenue - $tax - $refundsTotal, 2);

        // Foreign currency held at shift close — record only, never in cash math.
        $foreignCurrencyHeld = Shift::query()
            ->whereBetween('closed_at', [$from, $to])
            ->whereNotNull('foreign_currency_held')
            ->get(['id', 'user_id', 'variance', 'foreign_currency_held', 'closed_at'])
            ->flatMap(function (Shift $shift) {
                $rows = is_array($shift->foreign_currency_held) ? $shift->foreign_currency_held : [];

                return collect($rows)->map(fn (array $row) => [
                    'shift_id' => $shift->id,
                    'user_id' => $shift->user_id,
                    'variance' => (float) ($shift->variance ?? 0),
                    'currency' => (string) ($row['currency'] ?? ''),
                    'denomination' => (float) ($row['denomination'] ?? 0),
                    'count' => (int) ($row['count'] ?? 0),
                    'accepted_mvr' => (float) ($row['accepted_mvr'] ?? (($row['accepted_mvr_laari'] ?? 0) / 100)),
                ]);
            })
            ->values()
            ->all();

        $expenses = (float) Expense::whereDate('expense_date', $date)->where('status', 'approved')->sum('amount');
        // What arrived that day, not what was ordered — see PurchaseSpendQuery.
        $purchases = PurchaseSpendQuery::total($date, $date);
        $wasteCost = (float) WasteLog::whereBetween('created_at', [$from, $to])->sum('cost_estimate');

        $commissionSummary = app(PaymentCommissionService::class)->paymentCommissionSummary($from, $to);
        $paymentProcessingFees = (float) ($commissionSummary['totals']['commission_total'] ?? 0);

        $wholesale = app(WholesaleChannelAggregator::class)->summary($from, $to);
        $wholesaleRevenue = (float) $wholesale['revenue'];
        $wholesaleCogs = (float) $wholesale['cogs'];
        // Waste is inside $purchases already (the ingredients were bought);
        // it is reported, not subtracted again.
        $profit = round(
            $netRevenue
            + round($wholesaleRevenue - (float) $wholesale['tax'], 2)
            - $expenses - $purchases - $wholesaleCogs,
            2,
        );

        $totalLaar = ReportMoneySql::ORDER_TOTAL_LAAR;

        // Orders by type / channel
        $byType = Order::whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->selectRaw('orders.type as order_type, COUNT(*) as count')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr($totalLaar) . ' as revenue')
            ->groupBy('type')
            ->get();

        // Top items (retail)
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
            'wholesale_revenue' => $wholesaleRevenue,
            'wholesale' => $wholesale,
            'tax' => $tax,
            'discounts' => $discounts,
            'orders' => $orderCount,
            'avg_order' => $avgOrder,
            'expenses' => $expenses,
            'purchases' => $purchases,
            'wholesale_cogs' => $wholesaleCogs,
            'waste_cost' => $wasteCost,
            'wholesale_waste_cost' => round(app(WholesaleChannelAggregator::class)->wasteCostLaar($from, $to) / 100, 2),
            'payment_processing_fees' => $paymentProcessingFees,
            'payment_commission' => $commissionSummary,
            'net_profit' => $profit,
            'foreign_currency_held' => $foreignCurrencyHeld,
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
            'wholesale_top_items' => app(WholesaleChannelAggregator::class)->topItems($from, $to, 10),
        ]);
    }

    /**
     * One month, the owner's way: income in, ingredients and expenses out,
     * profit at the bottom, last month beside it. See MonthlySheetService.
     */
    public function monthlySheet(Request $request): JsonResponse
    {
        $month = (string) $request->query('month', now()->format('Y-m'));

        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) {
            return response()->json(['message' => 'Give the month as YYYY-MM.'], 422);
        }

        return response()->json(
            app(\App\Domains\Reporting\Services\MonthlySheetService::class)->sheet($month),
        );
    }

    // ──────────────────────────────────────────────────────────
    // Spend hub — purchases (stock/COGS) vs expenses (opex)
    // ──────────────────────────────────────────────────────────

    public function spendHub(Request $request): JsonResponse
    {
        [$from, $to] = $this->parseRange($request);
        $fromDate = $from->toDateString();
        $toDate = $to->toDateString();

        $purchasesTotal = PurchaseSpendQuery::total($fromDate, $toDate);

        // Orders that actually delivered something, which is what the money
        // beside it is made of. A draft nobody received is not a purchase yet.
        $poCount = (int) PurchaseSpendQuery::lines($fromDate, $toDate)
            ->distinct()
            ->count('purchase_items.purchase_id');

        $bySupplier = PurchaseSpendQuery::lines($fromDate, $toDate)
            ->leftJoin('suppliers', 'suppliers.id', '=', 'purchases.supplier_id')
            ->selectRaw('purchases.supplier_id, COALESCE(suppliers.name, ?) as supplier_name', ['Unknown'])
            ->selectRaw('COUNT(DISTINCT purchases.id) as po_count')
            ->selectRaw('SUM(' . PurchaseSpendQuery::RECEIVED_COST . ') as total')
            ->groupBy('purchases.supplier_id', 'suppliers.name')
            ->orderByDesc('total')
            ->limit(25)
            ->get()
            ->map(fn ($r) => [
                'supplier_id' => $r->supplier_id ? (int) $r->supplier_id : null,
                'supplier_name' => (string) $r->supplier_name,
                'po_count' => (int) $r->po_count,
                'total' => round((float) $r->total, 2),
            ])
            ->values()
            ->all();

        $topItems = DB::table('purchase_items')
            ->join('purchases', 'purchases.id', '=', 'purchase_items.purchase_id')
            ->leftJoin('inventory_items', 'inventory_items.id', '=', 'purchase_items.inventory_item_id')
            ->whereRaw(
                'DATE(COALESCE(purchases.actual_delivery_date, purchases.purchase_date)) BETWEEN ? AND ?',
                [$fromDate, $toDate],
            )
            ->whereNull('purchases.deleted_at')
            // No status filter: `received_quantity > 0` already says it
            // arrived, and a short-closed order's receipts are still real.
            ->where('purchase_items.received_quantity', '>', 0)
            ->selectRaw('purchase_items.inventory_item_id')
            ->selectRaw('COALESCE(inventory_items.name, ?) as item_name', ['Unknown item'])
            ->selectRaw('COALESCE(inventory_items.unit, ?) as unit', [''])
            ->selectRaw('SUM(purchase_items.received_quantity) as qty')
            ->selectRaw('SUM(purchase_items.received_quantity * purchase_items.unit_cost) as spend')
            ->groupBy('purchase_items.inventory_item_id', 'inventory_items.name', 'inventory_items.unit')
            ->orderByDesc('spend')
            ->limit(15)
            ->get()
            ->map(fn ($r) => [
                'inventory_item_id' => $r->inventory_item_id ? (int) $r->inventory_item_id : null,
                'item_name' => (string) $r->item_name,
                'unit' => (string) $r->unit,
                'qty' => round((float) $r->qty, 3),
                'spend' => round((float) $r->spend, 2),
            ])
            ->values()
            ->all();

        $expensesApproved = (float) Expense::query()
            ->whereDate('expense_date', '>=', $fromDate)
            ->whereDate('expense_date', '<=', $toDate)
            ->where('status', 'approved')
            ->sum('amount');

        $expensesPending = (float) Expense::query()
            ->whereDate('expense_date', '>=', $fromDate)
            ->whereDate('expense_date', '<=', $toDate)
            ->where('status', 'pending')
            ->sum('amount');

        $expensesRejected = (float) Expense::query()
            ->whereDate('expense_date', '>=', $fromDate)
            ->whereDate('expense_date', '<=', $toDate)
            ->where('status', 'rejected')
            ->sum('amount');

        $byCategory = Expense::query()
            ->whereDate('expense_date', '>=', $fromDate)
            ->whereDate('expense_date', '<=', $toDate)
            ->where('status', 'approved')
            ->selectRaw('expense_category_id, SUM(amount) as total, COUNT(*) as count')
            ->with('category:id,name,icon')
            ->groupBy('expense_category_id')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($e) => [
                'category' => $e->category?->name ?? 'Unknown',
                'icon' => $e->category?->icon,
                'total' => round((float) $e->total, 2),
                'count' => (int) $e->count,
            ])
            ->values()
            ->all();

        $linkedToPo = (int) Expense::query()
            ->whereDate('expense_date', '>=', $fromDate)
            ->whereDate('expense_date', '<=', $toDate)
            ->whereNotNull('purchase_id')
            ->count();

        $expenseByDay = Expense::query()
            ->whereDate('expense_date', '>=', $fromDate)
            ->whereDate('expense_date', '<=', $toDate)
            ->where('status', 'approved')
            ->selectRaw('DATE(expense_date) as date, SUM(amount) as amount')
            ->groupByRaw('DATE(expense_date)')
            ->pluck('amount', 'date');

        $purchaseByDay = PurchaseSpendQuery::byDay($fromDate, $toDate);

        $wasteCost = (float) WasteLog::query()
            ->whereBetween('created_at', [$from, $to])
            ->sum('cost_estimate');

        $wasteCount = (int) WasteLog::query()
            ->whereBetween('created_at', [$from, $to])
            ->count();

        $wasteByReason = WasteLog::query()
            ->whereBetween('created_at', [$from, $to])
            ->selectRaw('reason, COUNT(*) as count, SUM(cost_estimate) as total')
            ->groupBy('reason')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($r) => [
                'reason' => (string) ($r->reason ?: 'other'),
                'count' => (int) $r->count,
                'total' => round((float) $r->total, 2),
            ])
            ->values()
            ->all();

        $wasteByDay = WasteLog::query()
            ->whereBetween('created_at', [$from, $to])
            ->selectRaw('DATE(created_at) as date, SUM(cost_estimate) as amount')
            ->groupByRaw('DATE(created_at)')
            ->pluck('amount', 'date');

        $daily = [];
        $cursor = $from->copy()->startOfDay();
        $end = $to->copy()->startOfDay();
        while ($cursor->lte($end)) {
            $key = $cursor->toDateString();
            $p = round((float) ($purchaseByDay[$key] ?? 0), 2);
            $e = round((float) ($expenseByDay[$key] ?? 0), 2);
            $w = round((float) ($wasteByDay[$key] ?? 0), 2);
            $daily[] = [
                'date' => $key,
                'purchases' => $p,
                'expenses' => $e,
                'waste' => $w,
                'total' => round($p + $e, 2),
                'total_with_waste' => round($p + $e + $w, 2),
            ];
            $cursor->addDay();
        }

        return response()->json([
            'from' => $fromDate,
            'to' => $toDate,
            'note' => 'Purchases feed inventory and COGS. Expenses are operating cash costs. Waste is inventory shrinkage (not a second cash payment). Linking an expense to a PO is reference only — stock buys should not be logged again as expenses.',
            'totals' => [
                'purchases' => round($purchasesTotal, 2),
                'expenses_approved' => round($expensesApproved, 2),
                'expenses_pending' => round($expensesPending, 2),
                'expenses_rejected' => round($expensesRejected, 2),
                'waste_cost' => round($wasteCost, 2),
                'waste_count' => $wasteCount,
                'combined_outflow' => round($purchasesTotal + $expensesApproved, 2),
                'total_with_waste' => round($purchasesTotal + $expensesApproved + $wasteCost, 2),
                'po_count' => $poCount,
                'expenses_linked_to_po' => $linkedToPo,
            ],
            'purchases' => [
                'by_supplier' => $bySupplier,
                'top_items' => $topItems,
            ],
            'expenses' => [
                'by_category' => $byCategory,
                'by_status' => [
                    'approved' => round($expensesApproved, 2),
                    'pending' => round($expensesPending, 2),
                    'rejected' => round($expensesRejected, 2),
                ],
            ],
            'waste' => [
                'by_reason' => $wasteByReason,
            ],
            'daily' => $daily,
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
