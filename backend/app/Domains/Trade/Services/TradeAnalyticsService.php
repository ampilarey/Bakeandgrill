<?php

declare(strict_types=1);

namespace App\Domains\Trade\Services;

use App\Models\Invoice;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Stage F — owner wholesale analytics (sell-through, suggested qty, waste, margin, ageing, leaks).
 * All aggregates run in SQL — no per-shop / per-item query loops.
 */
final class TradeAnalyticsService
{

    /**
     * @return list<array<string, mixed>>
     */
    public function sellThrough(Carbon $from, Carbon $to): array
    {
        $rows = DB::table('trade_delivery_lines as l')
            ->join('trade_deliveries as d', 'd.id', '=', 'l.trade_delivery_id')
            ->join('trade_accounts as a', 'a.id', '=', 'd.trade_account_id')
            ->join('items', 'items.id', '=', 'l.item_id')
            ->whereNotNull('d.reconciled_at')
            ->whereBetween('d.reconciled_at', [$from, $to])
            ->selectRaw('a.id as trade_account_id')
            ->selectRaw('a.shop_name')
            ->selectRaw('items.id as item_id')
            ->selectRaw('items.name as item_name')
            ->selectRaw('SUM(l.qty_sent) as qty_sent')
            ->selectRaw('SUM(l.qty_sold) as qty_sold')
            ->selectRaw('SUM(l.qty_returned_good) as qty_returned_good')
            ->selectRaw('SUM(l.qty_returned_waste) as qty_wasted')
            ->selectRaw('SUM(l.qty_missing) as qty_missing')
            ->selectRaw('CASE WHEN SUM(l.qty_sent) > 0 THEN ROUND(100.0 * SUM(l.qty_sold) / SUM(l.qty_sent), 2) ELSE 0 END as sell_through_pct')
            ->groupBy('a.id', 'a.shop_name', 'items.id', 'items.name')
            ->orderBy('sell_through_pct')
            ->orderBy('a.shop_name')
            ->get();

        return $rows->map(fn ($r) => [
            'trade_account_id' => (int) $r->trade_account_id,
            'shop_name' => (string) $r->shop_name,
            'item_id' => (int) $r->item_id,
            'item_name' => (string) $r->item_name,
            'qty_sent' => (int) $r->qty_sent,
            'qty_sold' => (int) $r->qty_sold,
            'qty_returned_good' => (int) $r->qty_returned_good,
            'qty_wasted' => (int) $r->qty_wasted,
            'qty_missing' => (int) $r->qty_missing,
            'sell_through_pct' => (float) $r->sell_through_pct,
        ])->all();
    }

    /**
     * Trailing average of qty_sold over reconciled deliveries. Needs ≥3 deliveries.
     *
     * @return list<array<string, mixed>>
     */
    public function suggestedQuantities(?Carbon $asOf = null): array
    {
        $asOf = $asOf ?? now();

        // Per shop+item: count reconciled deliveries and average qty_sold.
        $rows = DB::table('trade_delivery_lines as l')
            ->join('trade_deliveries as d', 'd.id', '=', 'l.trade_delivery_id')
            ->join('trade_accounts as a', 'a.id', '=', 'd.trade_account_id')
            ->join('items', 'items.id', '=', 'l.item_id')
            ->whereNotNull('d.reconciled_at')
            ->where('d.reconciled_at', '<=', $asOf)
            ->selectRaw('a.id as trade_account_id')
            ->selectRaw('a.shop_name')
            ->selectRaw('items.id as item_id')
            ->selectRaw('items.name as item_name')
            ->selectRaw('COUNT(DISTINCT d.id) as deliveries_count')
            ->selectRaw('SUM(l.qty_sold) as total_sold')
            ->selectRaw('ROUND(1.0 * SUM(l.qty_sold) / COUNT(DISTINCT d.id), 2) as avg_sold')
            ->groupBy('a.id', 'a.shop_name', 'items.id', 'items.name')
            ->orderBy('a.shop_name')
            ->orderBy('items.name')
            ->get();

        return $rows->map(function ($r) {
            $count = (int) $r->deliveries_count;
            $enough = $count >= 3;
            $avg = (float) $r->avg_sold;

            return [
                'trade_account_id' => (int) $r->trade_account_id,
                'shop_name' => (string) $r->shop_name,
                'item_id' => (int) $r->item_id,
                'item_name' => (string) $r->item_name,
                'deliveries_count' => $count,
                'total_sold' => (int) $r->total_sold,
                'average_sold' => $avg,
                'suggested_qty' => $enough ? (int) max(0, (int) round($avg)) : null,
                'status' => $enough ? 'ok' : 'not_enough_history',
                'message' => $enough
                    ? sprintf(
                        'Average of %s sold across the last %d reconciled deliveries (rounded).',
                        rtrim(rtrim(number_format($avg, 2, '.', ''), '0'), '.'),
                        $count,
                    )
                    : 'Not enough history yet — need at least 3 reconciled deliveries.',
            ];
        })->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function wasteCost(Carbon $from, Carbon $to): array
    {
        $rows = DB::table('trade_delivery_lines as l')
            ->join('trade_deliveries as d', 'd.id', '=', 'l.trade_delivery_id')
            ->join('trade_accounts as a', 'a.id', '=', 'd.trade_account_id')
            ->join('items', 'items.id', '=', 'l.item_id')
            ->whereNotNull('d.reconciled_at')
            ->whereBetween('d.reconciled_at', [$from, $to])
            ->where('l.qty_returned_waste', '>', 0)
            ->selectRaw('a.id as trade_account_id, a.shop_name, items.id as item_id, items.name as item_name')
            ->selectRaw('SUM(l.qty_returned_waste) as qty_wasted')
            ->selectRaw('SUM(l.qty_returned_waste * l.unit_cost_laar) as waste_cost_laar')
            ->groupBy('a.id', 'a.shop_name', 'items.id', 'items.name')
            ->orderByDesc('waste_cost_laar')
            ->get();

        return $rows->map(fn ($r) => [
            'trade_account_id' => (int) $r->trade_account_id,
            'shop_name' => (string) $r->shop_name,
            'item_id' => (int) $r->item_id,
            'item_name' => (string) $r->item_name,
            'qty_wasted' => (int) $r->qty_wasted,
            'waste_cost_laar' => (int) $r->waste_cost_laar,
            'waste_cost' => round(((int) $r->waste_cost_laar) / 100, 2),
        ])->all();
    }

    /**
     * Margin = invoiced revenue − stamped COGS on those lines − waste cost in period.
     * Revenue/COGS tied to invoices issued in the window; waste to reconciliations in the window.
     *
     * @return list<array<string, mixed>>
     */
    public function marginsByShop(Carbon $from, Carbon $to): array
    {
        $rev = DB::table('trade_invoice_allocations as a')
            ->join('trade_delivery_lines as l', 'l.id', '=', 'a.trade_delivery_line_id')
            ->join('trade_deliveries as d', 'd.id', '=', 'l.trade_delivery_id')
            ->join('invoices as i', 'i.id', '=', 'a.invoice_id')
            ->whereNotNull('i.trade_account_id')
            ->where('i.type', 'sale')
            ->whereNotIn('i.status', ['void', 'cancelled', 'draft'])
            ->whereDate('i.issue_date', '>=', $from->toDateString())
            ->whereDate('i.issue_date', '<=', $to->toDateString())
            ->selectRaw('d.trade_account_id')
            ->selectRaw('SUM(a.amount_laar) as revenue_laar')
            ->selectRaw('SUM(a.qty_invoiced * l.unit_cost_laar) as cogs_laar')
            ->groupBy('d.trade_account_id');

        $waste = DB::table('trade_delivery_lines as l')
            ->join('trade_deliveries as d', 'd.id', '=', 'l.trade_delivery_id')
            ->whereNotNull('d.reconciled_at')
            ->whereBetween('d.reconciled_at', [$from, $to])
            ->selectRaw('d.trade_account_id')
            ->selectRaw('SUM(l.qty_returned_waste * l.unit_cost_laar) as waste_cost_laar')
            ->groupBy('d.trade_account_id');

        $rows = DB::table('trade_accounts as a')
            ->leftJoinSub($rev, 'rev', 'rev.trade_account_id', '=', 'a.id')
            ->leftJoinSub($waste, 'w', 'w.trade_account_id', '=', 'a.id')
            ->where('a.is_active', true)
            ->selectRaw('a.id as trade_account_id, a.shop_name')
            ->selectRaw('COALESCE(rev.revenue_laar, 0) as revenue_laar')
            ->selectRaw('COALESCE(rev.cogs_laar, 0) as cogs_laar')
            ->selectRaw('COALESCE(w.waste_cost_laar, 0) as waste_cost_laar')
            ->selectRaw('COALESCE(rev.revenue_laar, 0) - COALESCE(rev.cogs_laar, 0) - COALESCE(w.waste_cost_laar, 0) as margin_laar')
            ->orderByDesc('margin_laar')
            ->get();

        return $rows->map(fn ($r) => [
            'trade_account_id' => (int) $r->trade_account_id,
            'shop_name' => (string) $r->shop_name,
            'revenue_laar' => (int) $r->revenue_laar,
            'cogs_laar' => (int) $r->cogs_laar,
            'waste_cost_laar' => (int) $r->waste_cost_laar,
            'margin_laar' => (int) $r->margin_laar,
            'revenue' => round(((int) $r->revenue_laar) / 100, 2),
            'cogs' => round(((int) $r->cogs_laar) / 100, 2),
            'waste_cost' => round(((int) $r->waste_cost_laar) / 100, 2),
            'margin' => round(((int) $r->margin_laar) / 100, 2),
        ])->all();
    }

    /**
     * Ageing buckets: current (not yet due), 1–30, 31–60, 60+ days overdue.
     * Boundary: exactly 30 → 1-30; exactly 60 → 31-60; 61+ → 60+.
     * Bounded queries — no per-shop exposure round-trips.
     *
     * @return list<array<string, mixed>>
     */
    public function ageingReceivables(?Carbon $asOf = null): array
    {
        $asOf = ($asOf ?? now())->copy()->startOfDay();
        $asOfDate = $asOf->toDateString();

        $invoices = Invoice::query()
            ->whereNotNull('trade_account_id')
            ->where('type', 'sale')
            ->whereNotIn('status', ['paid', 'void', 'cancelled', 'draft'])
            ->whereRaw('total_laar > COALESCE(amount_paid_laar, 0)')
            ->get(['id', 'trade_account_id', 'due_date', 'total_laar', 'amount_paid_laar']);

        $byAccount = [];
        foreach ($invoices as $inv) {
            $aid = (int) $inv->trade_account_id;
            $byAccount[$aid] ??= [
                'current_laar' => 0,
                'days_1_30_laar' => 0,
                'days_31_60_laar' => 0,
                'days_60_plus_laar' => 0,
            ];
            $balance = max(0, (int) $inv->total_laar - (int) ($inv->amount_paid_laar ?? 0));
            if ($balance <= 0) {
                continue;
            }
            $due = $inv->due_date?->copy()->startOfDay();
            if ($due === null || $due->gte($asOf)) {
                $byAccount[$aid]['current_laar'] += $balance;
                continue;
            }
            $days = $due->diffInDays($asOf);
            if ($days <= 30) {
                $byAccount[$aid]['days_1_30_laar'] += $balance;
            } elseif ($days <= 60) {
                $byAccount[$aid]['days_31_60_laar'] += $balance;
            } else {
                $byAccount[$aid]['days_60_plus_laar'] += $balance;
            }
        }

        // Holding (unallocated) stamped value per shop — one SQL aggregation.
        $holdingRows = DB::table('trade_delivery_lines as l')
            ->join('trade_deliveries as d', 'd.id', '=', 'l.trade_delivery_id')
            ->join('trade_accounts as a', 'a.id', '=', 'd.trade_account_id')
            ->leftJoinSub(
                DB::table('trade_invoice_allocations')
                    ->selectRaw('trade_delivery_line_id, SUM(qty_invoiced) as qty')
                    ->groupBy('trade_delivery_line_id'),
                'alloc',
                'alloc.trade_delivery_line_id',
                '=',
                'l.id',
            )
            ->where('d.status', '!=', TradeDelivery::STATUS_CANCELLED)
            ->selectRaw('a.id as trade_account_id')
            ->selectRaw(
                'SUM(
                    CASE
                        WHEN d.status = ? THEN
                            CASE WHEN (l.qty_sent - COALESCE(alloc.qty, 0)) > 0
                                THEN (l.qty_sent - COALESCE(alloc.qty, 0)) * l.unit_price_laar
                                ELSE 0 END
                        ELSE
                            CASE WHEN ((l.qty_sold + CASE
                                WHEN d.missing_charge_waived = 1 THEN 0
                                WHEN a.missing_policy = ? THEN 0
                                ELSE l.qty_missing
                            END) - COALESCE(alloc.qty, 0)) > 0
                                THEN ((l.qty_sold + CASE
                                    WHEN d.missing_charge_waived = 1 THEN 0
                                    WHEN a.missing_policy = ? THEN 0
                                    ELSE l.qty_missing
                                END) - COALESCE(alloc.qty, 0)) * l.unit_price_laar
                                ELSE 0 END
                    END
                ) as holding_laar',
                [
                    TradeDelivery::STATUS_DISPATCHED,
                    TradeAccount::MISSING_WRITE_OFF,
                    TradeAccount::MISSING_WRITE_OFF,
                ],
            )
            ->groupBy('a.id')
            ->pluck('holding_laar', 'trade_account_id');

        $active = TradeAccount::query()
            ->where('is_active', true)
            ->with('customer:id,credit_balance_laar,credit_limit_laar')
            ->get(['id', 'shop_name', 'customer_id']);

        $out = [];
        foreach ($active as $account) {
            $buckets = $byAccount[$account->id] ?? [
                'current_laar' => 0,
                'days_1_30_laar' => 0,
                'days_31_60_laar' => 0,
                'days_60_plus_laar' => 0,
            ];
            $balanceOwed = (int) ($account->customer?->credit_balance_laar ?? 0);
            $holding = (int) ($holdingRows[$account->id] ?? 0);
            $limit = (int) ($account->customer?->credit_limit_laar ?? 0);
            $exposure = $balanceOwed + $holding;
            $outstanding = $buckets['current_laar'] + $buckets['days_1_30_laar']
                + $buckets['days_31_60_laar'] + $buckets['days_60_plus_laar'];
            if ($outstanding === 0 && $exposure === 0) {
                continue;
            }
            $out[] = [
                'trade_account_id' => $account->id,
                'shop_name' => $account->shop_name,
                'current_laar' => $buckets['current_laar'],
                'days_1_30_laar' => $buckets['days_1_30_laar'],
                'days_31_60_laar' => $buckets['days_31_60_laar'],
                'days_60_plus_laar' => $buckets['days_60_plus_laar'],
                'outstanding_laar' => $outstanding,
                'credit_limit_laar' => $limit,
                'exposure_laar' => $exposure,
                'balance_owed_laar' => $balanceOwed,
                'holding_unbilled_laar' => $holding,
                'current' => round($buckets['current_laar'] / 100, 2),
                'days_1_30' => round($buckets['days_1_30_laar'] / 100, 2),
                'days_31_60' => round($buckets['days_31_60_laar'] / 100, 2),
                'days_60_plus' => round($buckets['days_60_plus_laar'] / 100, 2),
                'outstanding' => round($outstanding / 100, 2),
                'credit_limit' => round($limit / 100, 2),
                'exposure' => round($exposure / 100, 2),
                'as_of' => $asOfDate,
            ];
        }

        usort($out, fn ($a, $b) => $b['days_60_plus_laar'] <=> $a['days_60_plus_laar']
            ?: $b['outstanding_laar'] <=> $a['outstanding_laar']);

        return $out;
    }

    /**
     * @return array{unreconciled: list<array<string, mixed>>, mismatches: list<array<string, mixed>>}
     */
    public function leakLists(int $olderThanDays = 3, ?Carbon $asOf = null): array
    {
        $asOf = $asOf ?? now();
        $cutoff = $asOf->copy()->subDays($olderThanDays);

        $unreconciled = TradeDelivery::query()
            ->with('tradeAccount:id,shop_name')
            ->where('status', TradeDelivery::STATUS_DISPATCHED)
            ->whereNotNull('dispatched_at')
            ->where('dispatched_at', '<=', $cutoff)
            ->orderBy('dispatched_at')
            ->get()
            ->map(fn (TradeDelivery $d) => [
                'id' => $d->id,
                'delivery_number' => $d->delivery_number,
                'shop_name' => $d->tradeAccount?->shop_name,
                'trade_account_id' => $d->trade_account_id,
                'dispatched_at' => $d->dispatched_at?->toIso8601String(),
                'days_outstanding' => $d->dispatched_at
                    ? $d->dispatched_at->diffInDays($asOf)
                    : null,
            ])
            ->all();

        $mismatches = TradeDelivery::query()
            ->with('tradeAccount:id,shop_name')
            ->where('has_mismatch', true)
            ->whereNull('mismatch_resolved_at')
            ->orderByDesc('reconciled_at')
            ->get()
            ->map(fn (TradeDelivery $d) => [
                'id' => $d->id,
                'delivery_number' => $d->delivery_number,
                'shop_name' => $d->tradeAccount?->shop_name,
                'trade_account_id' => $d->trade_account_id,
                'reconciled_at' => $d->reconciled_at?->toIso8601String(),
                'status' => $d->status,
            ])
            ->all();

        return [
            'unreconciled' => $unreconciled,
            'mismatches' => $mismatches,
            'older_than_days' => $olderThanDays,
        ];
    }
}
