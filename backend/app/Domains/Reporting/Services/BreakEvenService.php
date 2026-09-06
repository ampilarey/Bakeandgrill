<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use App\Domains\Reporting\Support\BreakEvenCalculator;
use App\Domains\Reporting\Support\PurchaseSpendQuery;
use App\Domains\Reporting\Support\ReportMoneySql;
use App\Domains\Trade\Services\WholesaleChannelAggregator;
use App\Models\Expense;
use App\Models\Order;
use App\Models\Refund;
use App\Models\WasteLog;
use Carbon\Carbon;

/**
 * Seeds the break-even calculator from real trailing figures.
 *
 * Everything here is a *starting point the owner overrides* in the UI — that
 * is what makes the tool an estimate rather than a claim. The service's job is
 * to hand over a defensible seed and the break-even that seed implies; the
 * what-if happens client-side against BreakEvenCalculator's mirror.
 *
 * Revenue is net of output GST (a liability the shop remits, not income —
 * AUDIT_FINANCE_2026-08-26.md F1/F2). Purchase cost is the money actually
 * paid: the café does not claim input tax back (owner, 2026-09-06), so the
 * price on the line is the cost, tax and all. See PurchaseSpendQuery.
 */
class BreakEvenService
{
    public function __construct(
        private readonly WholesaleChannelAggregator $wholesale = new WholesaleChannelAggregator,
    ) {}

    /**
     * @return array{
     *   from: string,
     *   to: string,
     *   days_in_window: int,
     *   revenue_ex_gst: float,
     *   variable_cost: float,
     *   fixed_cost: float,
     *   contribution_margin_ratio: float,
     *   fixed_cost_monthly: float,
     *   fixed_cost_lines: list<array{key: string, label: string, monthly: float}>,
     *   avg_daily_revenue_ex_gst: float,
     *   break_even_revenue_monthly: float|null,
     *   break_even_revenue_daily: float|null,
     *   currently_covers: bool|null,
     *   components: array<string, float>,
     * }
     */
    public function estimate(Carbon $from, Carbon $to): array
    {
        // Inclusive calendar days. Count from start-of-day on both ends —
        // $to is an end-of-day boundary, and Carbon's float diffInDays would
        // otherwise read that near-midnight as an extra day and understate the
        // monthly fixed cost.
        $days = (int) $from->copy()->startOfDay()->diffInDays($to->copy()->startOfDay()) + 1;

        // Retail revenue, GST-exclusive: what the customer paid, less the
        // output tax we remit, less refunds already given back.
        $retail = Order::whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TOTAL_LAAR) . ' as total')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TAX_LAAR) . ' as tax')
            ->first();

        $retailGross = (float) ($retail->total ?? 0);
        $retailTax = (float) ($retail->tax ?? 0);

        $refunds = (float) Refund::whereBetween('created_at', [$from, $to])
            ->whereIn('status', ['approved', 'processed', 'completed'])
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::REFUND_AMOUNT_LAAR) . ' as total')
            ->value('total');

        $wholesale = $this->wholesale->summary($from, $to);
        $wholesaleRevenueExGst = (float) $wholesale['revenue'] - (float) $wholesale['tax'];

        $revenueExGst = round(max(0.0, $retailGross - $retailTax - $refunds) + $wholesaleRevenueExGst, 2);

        // Variable cost = what the stock that arrived actually cost — a part
        // delivery costs what came off the van, and the entered price is the
        // money paid since input GST is never claimed back. Wholesale COGS
        // comes ex-tax from its own aggregator.
        $purchaseCogs = PurchaseSpendQuery::total($from->toDateString(), $to->toDateString());

        $variableCost = round($purchaseCogs + (float) $wholesale['cogs'], 2);

        // Fixed cost = approved operating expenses over the window, itemised
        // by expense category so the owner sees and tunes each line (rent,
        // salaries, utilities…) rather than one lump. Waste is deliberately
        // NOT a cost line any more: the wasted ingredients were bought, so
        // their money is already inside the purchase COGS above — a waste
        // line on top counted it twice. It stays in components as a figure
        // worth watching.
        $opexByCategory = Expense::whereDate('expense_date', '>=', $from->toDateString())
            ->whereDate('expense_date', '<=', $to->toDateString())
            ->where('status', 'approved')
            ->selectRaw('SUM(amount) as total, expense_category_id')
            ->with('category:id,name,icon')
            ->groupBy('expense_category_id')
            ->get();

        $opex = (float) $opexByCategory->sum('total');
        $waste = (float) WasteLog::whereBetween('created_at', [$from, $to])->sum('cost_estimate');
        $fixedCost = round($opex, 2);

        // One monthly-normalised row per category, biggest first.
        $fixedLines = $opexByCategory
            ->map(fn ($row) => [
                'key' => 'category:' . ($row->expense_category_id ?? 'none'),
                'label' => $row->category?->name ?? 'Uncategorised',
                'monthly' => round(((float) $row->total) / $days * 30, 2),
            ])
            ->filter(fn (array $line) => $line['monthly'] > 0)
            ->sortByDesc('monthly')
            ->values()
            ->all();

        $marginRatio = BreakEvenCalculator::contributionMarginRatio($revenueExGst, $variableCost);

        // Normalise fixed cost to a 30-day month so the target reads as a
        // monthly number regardless of the window the owner picked.
        $fixedCostMonthly = round($fixedCost / $days * 30, 2);
        $breakEvenMonthly = BreakEvenCalculator::breakEvenRevenue($fixedCostMonthly, $marginRatio);

        $avgDailyRevenue = round($revenueExGst / $days, 2);
        $breakEvenDaily = $breakEvenMonthly === null ? null : round($breakEvenMonthly / 30, 2);

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'days_in_window' => $days,
            'revenue_ex_gst' => $revenueExGst,
            'variable_cost' => $variableCost,
            'fixed_cost' => $fixedCost,
            'contribution_margin_ratio' => $marginRatio,
            'fixed_cost_monthly' => $fixedCostMonthly,
            'fixed_cost_lines' => $fixedLines,
            'avg_daily_revenue_ex_gst' => $avgDailyRevenue,
            'break_even_revenue_monthly' => $breakEvenMonthly,
            'break_even_revenue_daily' => $breakEvenDaily,
            'currently_covers' => $breakEvenDaily === null ? null : $avgDailyRevenue >= $breakEvenDaily,
            'components' => [
                'retail_revenue_ex_gst' => round(max(0.0, $retailGross - $retailTax - $refunds), 2),
                'wholesale_revenue_ex_gst' => round($wholesaleRevenueExGst, 2),
                'purchase_cogs' => round($purchaseCogs, 2),
                // Old key, kept so a cached client keeps rendering.
                'purchase_cogs_ex_gst' => round($purchaseCogs, 2),
                'wholesale_cogs' => (float) $wholesale['cogs'],
                'operating_expenses' => round($opex, 2),
                'waste' => round($waste, 2),
                'refunds' => round($refunds, 2),
            ],
        ];
    }
}
