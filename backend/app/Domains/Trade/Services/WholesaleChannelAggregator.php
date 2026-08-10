<?php

declare(strict_types=1);

namespace App\Domains\Trade\Services;

use App\Domains\Gst\Services\GstLedgerPoster;
use Carbon\Carbon;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Stage F — wholesale revenue recognised once at the tax point, separate from retail.
 * Invoice / hybrid basis → invoice issue_date; payment basis → confirmed payments.
 */
final class WholesaleChannelAggregator
{
    public function __construct(
        private readonly GstLedgerPoster $gst = new GstLedgerPoster,
    ) {}

    public function recognizesOnPayment(): bool
    {
        return $this->gst->shouldPostOrderOnPayment() && ! $this->gst->shouldPostOnTaxInvoice();
    }

    /**
     * SQLite (and some drivers) persist date casts as datetimes. Bare
     * whereBetween('col', ['Y-m-d','Y-m-d']) excludes those rows on the upper bound.
     */
    private function scopeIssueDate(Builder $q, Carbon $from, Carbon $to): Builder
    {
        return $q->whereDate('i.issue_date', '>=', $from->toDateString())
            ->whereDate('i.issue_date', '<=', $to->toDateString());
    }

    /**
     * @return array{
     *   invoices_count: int,
     *   revenue_laar: int,
     *   tax_laar: int,
     *   cogs_laar: int,
     *   revenue: float,
     *   tax: float,
     *   cogs: float
     * }
     */
    public function summary(Carbon $from, Carbon $to): array
    {
        if ($this->recognizesOnPayment()) {
            $row = DB::table('payments as p')
                ->join('invoices as i', 'i.id', '=', 'p.invoice_id')
                ->whereNotNull('p.invoice_id')
                ->whereNull('p.order_id')
                ->whereNotNull('i.trade_account_id')
                ->where('i.type', 'sale')
                ->whereIn('p.status', ['confirmed', 'paid', 'completed'])
                ->whereBetween('p.processed_at', [$from, $to])
                ->selectRaw('COUNT(DISTINCT i.id) as invoices_count')
                ->selectRaw('COALESCE(SUM(p.amount_laar), 0) as revenue_laar')
                ->selectRaw('COALESCE(SUM(CAST(ROUND(i.tax_laar * p.amount_laar / NULLIF(i.total_laar, 0)) AS INTEGER)), 0) as tax_laar')
                ->first();
        } else {
            $row = $this->scopeIssueDate(
                DB::table('invoices as i')
                    ->whereNotNull('i.trade_account_id')
                    ->whereIn('i.type', ['sale', 'credit_note'])
                    ->whereNotIn('i.status', ['void', 'cancelled', 'draft']),
                $from,
                $to,
            )
                ->selectRaw('COUNT(*) as invoices_count')
                ->selectRaw('COALESCE(SUM(CASE WHEN i.type = \'credit_note\' THEN -i.total_laar ELSE i.total_laar END), 0) as revenue_laar')
                ->selectRaw('COALESCE(SUM(CASE WHEN i.type = \'credit_note\' THEN -i.tax_laar ELSE i.tax_laar END), 0) as tax_laar')
                ->first();
        }

        $cogsLaar = $this->cogsLaar($from, $to);

        $revenueLaar = (int) ($row->revenue_laar ?? 0);
        $taxLaar = (int) ($row->tax_laar ?? 0);

        return [
            'invoices_count' => (int) ($row->invoices_count ?? 0),
            'revenue_laar' => $revenueLaar,
            'tax_laar' => $taxLaar,
            'cogs_laar' => $cogsLaar,
            'revenue' => round($revenueLaar / 100, 2),
            'tax' => round($taxLaar / 100, 2),
            'cogs' => round($cogsLaar / 100, 2),
        ];
    }

    /** Stamped unit_cost_laar × qty allocated on invoices recognised in the window. */
    public function cogsLaar(Carbon $from, Carbon $to): int
    {
        $q = DB::table('trade_invoice_allocations as a')
            ->join('trade_delivery_lines as l', 'l.id', '=', 'a.trade_delivery_line_id')
            ->join('invoices as i', 'i.id', '=', 'a.invoice_id')
            ->whereNotNull('i.trade_account_id')
            ->where('i.type', 'sale')
            ->whereNotIn('i.status', ['void', 'cancelled', 'draft']);

        if ($this->recognizesOnPayment()) {
            $q->join('payments as p', function ($join) {
                $join->on('p.invoice_id', '=', 'i.id')
                    ->whereNull('p.order_id')
                    ->whereIn('p.status', ['confirmed', 'paid', 'completed']);
            })
                ->whereBetween('p.processed_at', [$from, $to])
                // Attribute COGS proportionally to the payment share of the invoice.
                ->selectRaw('COALESCE(SUM(CAST(ROUND(a.qty_invoiced * l.unit_cost_laar * p.amount_laar / NULLIF(i.total_laar, 0)) AS INTEGER)), 0) as cogs_laar');
        } else {
            $this->scopeIssueDate($q, $from, $to)
                ->selectRaw('COALESCE(SUM(a.qty_invoiced * l.unit_cost_laar), 0) as cogs_laar');
        }

        return (int) $q->value('cogs_laar');
    }

    /**
     * Waste at stamped cost for deliveries reconciled in the window.
     * Display / analytics only — P&L waste_cost still comes from WasteLog once.
     */
    public function wasteCostLaar(Carbon $from, Carbon $to): int
    {
        return (int) DB::table('trade_delivery_lines as l')
            ->join('trade_deliveries as d', 'd.id', '=', 'l.trade_delivery_id')
            ->whereNotNull('d.reconciled_at')
            ->whereBetween('d.reconciled_at', [$from, $to])
            ->selectRaw('COALESCE(SUM(l.qty_returned_waste * l.unit_cost_laar), 0) as waste_laar')
            ->value('waste_laar');
    }

    /**
     * Top wholesale items by revenue in the recognition window.
     *
     * @return list<array{item_id: int|null, item_name: string, quantity: float, total: float, channel: string}>
     */
    public function topItems(Carbon $from, Carbon $to, int $limit = 100): array
    {
        $q = DB::table('trade_invoice_allocations as a')
            ->join('trade_delivery_lines as l', 'l.id', '=', 'a.trade_delivery_line_id')
            ->join('items', 'items.id', '=', 'l.item_id')
            ->join('invoices as i', 'i.id', '=', 'a.invoice_id')
            ->whereNotNull('i.trade_account_id')
            ->where('i.type', 'sale')
            ->whereNotIn('i.status', ['void', 'cancelled', 'draft']);

        if ($this->recognizesOnPayment()) {
            $q->join('payments as p', function ($join) {
                $join->on('p.invoice_id', '=', 'i.id')
                    ->whereNull('p.order_id')
                    ->whereIn('p.status', ['confirmed', 'paid', 'completed']);
            })
                ->whereBetween('p.processed_at', [$from, $to])
                ->selectRaw('items.id as item_id, items.name as item_name')
                ->selectRaw('SUM(CAST(a.qty_invoiced * p.amount_laar AS FLOAT) / NULLIF(i.total_laar, 0)) as quantity')
                ->selectRaw('SUM(CAST(a.amount_laar * p.amount_laar AS FLOAT) / NULLIF(i.total_laar, 0)) / 100.0 as total');
        } else {
            $this->scopeIssueDate($q, $from, $to)
                ->selectRaw('items.id as item_id, items.name as item_name')
                ->selectRaw('SUM(a.qty_invoiced) as quantity')
                ->selectRaw('SUM(a.amount_laar) / 100.0 as total');
        }

        return $q->groupBy('items.id', 'items.name')
            ->orderByDesc('total')
            ->limit(min($limit, 500))
            ->get()
            ->map(fn ($r) => [
                'item_id' => $r->item_id !== null ? (int) $r->item_id : null,
                'item_name' => (string) $r->item_name,
                'quantity' => round((float) $r->quantity, 3),
                'total' => round((float) $r->total, 2),
                'channel' => 'wholesale',
            ])
            ->all();
    }

    /**
     * Day → wholesale revenue MVR for cash-flow style series.
     *
     * @return array<string, float>
     */
    public function revenueByDay(Carbon $from, Carbon $to): array
    {
        if ($this->recognizesOnPayment()) {
            $rows = DB::table('payments as p')
                ->join('invoices as i', 'i.id', '=', 'p.invoice_id')
                ->whereNotNull('p.invoice_id')
                ->whereNull('p.order_id')
                ->whereNotNull('i.trade_account_id')
                ->where('i.type', 'sale')
                ->whereIn('p.status', ['confirmed', 'paid', 'completed'])
                ->whereBetween('p.processed_at', [$from, $to])
                ->selectRaw('DATE(p.processed_at) as date')
                ->selectRaw('COALESCE(SUM(p.amount_laar), 0) / 100.0 as amount')
                ->groupBy(DB::raw('DATE(p.processed_at)'))
                ->get();
        } else {
            $rows = $this->scopeIssueDate(
                DB::table('invoices as i')
                    ->whereNotNull('i.trade_account_id')
                    ->whereIn('i.type', ['sale', 'credit_note'])
                    ->whereNotIn('i.status', ['void', 'cancelled', 'draft']),
                $from,
                $to,
            )
                ->selectRaw('DATE(i.issue_date) as date')
                ->selectRaw('COALESCE(SUM(CASE WHEN i.type = \'credit_note\' THEN -i.total_laar ELSE i.total_laar END), 0) / 100.0 as amount')
                ->groupBy(DB::raw('DATE(i.issue_date)'))
                ->get();
        }

        $out = [];
        foreach ($rows as $r) {
            $key = Carbon::parse((string) $r->date)->toDateString();
            $out[$key] = round((float) $r->amount, 2);
        }

        return $out;
    }
}
