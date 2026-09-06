<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use App\Domains\Reporting\Support\PurchaseSpendQuery;
use App\Domains\Reporting\Support\ReportMoneySql;
use App\Domains\Trade\Services\WholesaleChannelAggregator;
use App\Models\Expense;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\Refund;
use App\Models\StockMovement;
use App\Models\WasteLog;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The owner's accounting model, on one sheet.
 *
 * Owner, 2026-09-06: "item purchased, salary, rent ect.. comes under each
 * month cost, and income is from the sales, profit and loss should be
 * calculated based on this … cost of purchasing all ingredients must be
 * recorded as a cost."
 *
 * That is exactly what this computes, month by month:
 *
 *     profit = income the shop keeps
 *            − ingredients bought that month
 *            − expenses (salary, rent, …)
 *
 * Income is net of the output GST collected for MIRA; ingredient cost is the
 * money handed over for what was actually received (see PurchaseSpendQuery);
 * expenses are the approved ones. Nothing here is a new definition — it is
 * the same numbers the P&L uses, arranged the way the owner thinks.
 *
 * The one refinement offered on top is the **stock change**: buy a big sack
 * of flour on the 30th and the month looks bad while the next looks great.
 * The sheet shows how much the shelves grew or shrank over the month (valued
 * at current unit cost — an estimate, and labelled as one) and a second
 * profit figure adjusted for it. The headline stays on the owner's model.
 */
final class MonthlySheetService
{
    public function __construct(
        private readonly WholesaleChannelAggregator $wholesale = new WholesaleChannelAggregator,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function sheet(string $month): array
    {
        $current = $this->oneMonth($month);
        $previous = $this->oneMonth(
            Carbon::createFromFormat('Y-m', $month)->subMonthNoOverflow()->format('Y-m'),
        );

        return $current + ['previous' => $previous];
    }

    /**
     * @return array<string, mixed>
     */
    private function oneMonth(string $month): array
    {
        $from = Carbon::createFromFormat('Y-m', $month)->startOfMonth();
        // A month still in progress runs to now, so today's sheet is live
        // rather than pretending the month is over.
        $to = $from->copy()->endOfMonth()->min(now());

        // ── Income: what the shop keeps ─────────────────────────────────
        $orders = Order::whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->selectRaw('COUNT(*) as n')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TOTAL_LAAR) . ' as total')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TAX_LAAR) . ' as tax')
            ->first();

        $takings = (float) ($orders->total ?? 0);
        $gst = (float) ($orders->tax ?? 0);

        $refunds = (float) Refund::whereBetween('created_at', [$from, $to])
            ->whereIn('status', ['approved', 'processed', 'completed'])
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::REFUND_AMOUNT_LAAR) . ' as total')
            ->value('total');

        $wholesale = $this->wholesale->summary($from, $to);
        $wholesaleNet = round((float) $wholesale['revenue'] - (float) $wholesale['tax'], 2);

        $income = round($takings - $gst - $refunds + $wholesaleNet, 2);

        // ── Cost: ingredients bought + expenses ─────────────────────────
        $ingredients = PurchaseSpendQuery::total($from->toDateString(), $to->toDateString());

        $byCategory = Expense::whereDate('expense_date', '>=', $from->toDateString())
            ->whereDate('expense_date', '<=', $to->toDateString())
            ->where('status', 'approved')
            ->selectRaw('SUM(amount) as total, expense_category_id')
            ->with('category:id,name,icon')
            ->groupBy('expense_category_id')
            ->get();

        $expensesTotal = round((float) $byCategory->sum('total'), 2);

        // Watched, not subtracted: the wasted ingredients are already inside
        // the purchases figure.
        $waste = round((float) WasteLog::whereBetween('created_at', [$from, $to])->sum('cost_estimate'), 2);

        $profit = round($income - $ingredients - $expensesTotal, 2);

        // ── Stock change: the lumpiness corrector ───────────────────────
        $stock = $this->stockChange($from, $to);
        $profitByUsage = $stock === null
            ? null
            : round($profit + $stock['change'], 2);

        return [
            'month' => $month,
            'label' => $from->format('F Y'),
            'days_covered' => (int) $from->diffInDays($to->copy()->addSecond()->startOfDay()) ?: 1,
            'is_current' => $from->isSameMonth(now()),
            'income' => [
                'takings_incl_gst' => round($takings, 2),
                'gst_for_mira' => round($gst, 2),
                'refunds' => round($refunds, 2),
                'wholesale_net' => $wholesaleNet,
                'orders' => (int) ($orders->n ?? 0),
                'total' => $income,
            ],
            'ingredients' => round($ingredients, 2),
            'expenses' => [
                'total' => $expensesTotal,
                'by_category' => $byCategory
                    ->map(fn ($row) => [
                        'category' => $row->category?->name ?? 'Uncategorised',
                        'icon' => $row->category?->icon,
                        'total' => round((float) $row->total, 2),
                    ])
                    ->sortByDesc('total')
                    ->values()
                    ->all(),
            ],
            'waste_info' => $waste,
            'profit' => $profit,
            'stock_change' => $stock,
            'profit_by_usage' => $profitByUsage,
        ];
    }

    /**
     * How much the shelves grew or shrank over the month, in money.
     *
     * Quantity at each boundary is walked back from today's count using the
     * movements since — the only history the system keeps — and valued at the
     * item's current unit cost. That valuation is an estimate (prices drift),
     * which is why the sheet labels it one and keeps the headline profit on
     * the owner's purchases-as-cost model.
     *
     * @return array{opening_value: float, closing_value: float, change: float}|null
     */
    private function stockChange(Carbon $from, Carbon $to): ?array
    {
        $items = InventoryItem::query()
            ->where('is_active', true)
            ->get(['id', 'current_stock', 'unit_cost']);

        if ($items->isEmpty()) {
            return null;
        }

        $movedSince = function (Carbon $boundary): array {
            return DB::table('stock_movements')
                ->whereRaw(StockMovement::OCCURRED_AT_SQL . ' >= ?', [$boundary])
                ->selectRaw('inventory_item_id, SUM(quantity) as moved')
                ->groupBy('inventory_item_id')
                ->pluck('moved', 'inventory_item_id')
                ->map(fn ($v) => (float) $v)
                ->all();
        };

        $sinceOpen = $movedSince($from);
        // Closing boundary: end of the month, or now for a live month.
        $closingAt = $to->copy()->addSecond();
        $sinceClose = $movedSince($closingAt);

        $opening = 0.0;
        $closing = 0.0;
        foreach ($items as $item) {
            $cost = (float) ($item->unit_cost ?? 0);
            if ($cost <= 0) {
                continue;
            }
            $nowQty = (float) ($item->current_stock ?? 0);
            $opening += max(0, $nowQty - ($sinceOpen[$item->id] ?? 0)) * $cost;
            $closing += max(0, $nowQty - ($sinceClose[$item->id] ?? 0)) * $cost;
        }

        return [
            'opening_value' => round($opening, 2),
            'closing_value' => round($closing, 2),
            'change' => round($closing - $opening, 2),
        ];
    }
}
