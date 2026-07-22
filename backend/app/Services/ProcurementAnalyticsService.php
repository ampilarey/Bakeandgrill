<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Expense;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItemQuote;
use App\Models\SupplierPriceHistory;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class ProcurementAnalyticsService
{
    private const MAX_RANGE_DAYS = 366;

    /**
     * @return array<string, mixed>
     */
    public function report(?string $from, ?string $to, ?int $inventoryItemId = null): array
    {
        [$fromDate, $toDate] = $this->resolveRange($from, $to);

        return [
            'from' => $fromDate->toDateString(),
            'to' => $toDate->toDateString(),
            'spend_by_category' => $this->spendByCategory($fromDate, $toDate),
            'spend_by_supplier' => $this->spendBySupplier($fromDate, $toDate),
            'spend_by_buyer' => $this->spendByBuyer($fromDate, $toDate),
            'price_trend' => $this->priceTrend($fromDate, $toDate, $inventoryItemId),
            'savings' => $this->savings($fromDate, $toDate),
        ];
    }

    /**
     * @return array{0: Carbon, 1: Carbon}
     */
    private function resolveRange(?string $from, ?string $to): array
    {
        $toDate = $to ? Carbon::parse($to)->endOfDay() : now()->endOfDay();
        $fromDate = $from ? Carbon::parse($from)->startOfDay() : $toDate->copy()->subDays(29)->startOfDay();

        if ($fromDate->gt($toDate)) {
            throw ValidationException::withMessages(['from' => ['from must be on or before to.']]);
        }

        if ($fromDate->diffInDays($toDate) > self::MAX_RANGE_DAYS) {
            throw ValidationException::withMessages(['from' => ['Date range cannot exceed ' . self::MAX_RANGE_DAYS . ' days.']]);
        }

        return [$fromDate, $toDate];
    }

    /**
     * @return list<array{category_id: int|null, category: string, amount_laar: int, count: int}>
     */
    private function spendByCategory(Carbon $from, Carbon $to): array
    {
        return Expense::query()
            ->leftJoin('expense_categories as ec', 'ec.id', '=', 'expenses.expense_category_id')
            ->whereDate('expenses.expense_date', '>=', $from->toDateString())
            ->whereDate('expenses.expense_date', '<=', $to->toDateString())
            ->whereNull('expenses.deleted_at')
            ->groupBy('expenses.expense_category_id', 'ec.name')
            ->orderByDesc(DB::raw('SUM(COALESCE(expenses.amount_laar, 0))'))
            ->limit(50)
            ->get([
                'expenses.expense_category_id as category_id',
                DB::raw("COALESCE(ec.name, 'Uncategorised') as category"),
                DB::raw('SUM(COALESCE(expenses.amount_laar, 0)) as amount_laar'),
                DB::raw('COUNT(*) as count'),
            ])
            ->map(fn ($r) => [
                'category_id' => $r->category_id !== null ? (int) $r->category_id : null,
                'category' => (string) $r->category,
                'amount_laar' => (int) $r->amount_laar,
                'count' => (int) $r->count,
            ])
            ->all();
    }

    /**
     * @return list<array{supplier_id: int|null, supplier: string, expense_laar: int, history_spend_mvr: float, expense_count: int}>
     */
    private function spendBySupplier(Carbon $from, Carbon $to): array
    {
        $expenses = Expense::query()
            ->leftJoin('suppliers as s', 's.id', '=', 'expenses.supplier_id')
            ->whereDate('expenses.expense_date', '>=', $from->toDateString())
            ->whereDate('expenses.expense_date', '<=', $to->toDateString())
            ->whereNull('expenses.deleted_at')
            ->groupBy('expenses.supplier_id', 's.name')
            ->orderByDesc(DB::raw('SUM(COALESCE(expenses.amount_laar, 0))'))
            ->limit(50)
            ->get([
                'expenses.supplier_id',
                DB::raw("COALESCE(s.name, 'Unknown / cash shop') as supplier"),
                DB::raw('SUM(COALESCE(expenses.amount_laar, 0)) as expense_laar'),
                DB::raw('COUNT(*) as expense_count'),
            ])
            ->keyBy(fn ($r) => $r->supplier_id !== null ? (string) $r->supplier_id : 'null');

        $history = SupplierPriceHistory::query()
            ->join('suppliers as s', 's.id', '=', 'supplier_price_history.supplier_id')
            ->whereDate('supplier_price_history.recorded_at', '>=', $from->toDateString())
            ->whereDate('supplier_price_history.recorded_at', '<=', $to->toDateString())
            ->groupBy('supplier_price_history.supplier_id', 's.name')
            ->orderByDesc(DB::raw('SUM(supplier_price_history.unit_price)'))
            ->limit(50)
            ->get([
                'supplier_price_history.supplier_id',
                's.name as supplier',
                DB::raw('SUM(supplier_price_history.unit_price) as history_spend_mvr'),
            ])
            ->keyBy(fn ($r) => (string) $r->supplier_id);

        $ids = collect($expenses->keys())->merge($history->keys())->unique()->values();

        return $ids->map(function ($key) use ($expenses, $history) {
            $exp = $expenses->get($key);
            $hist = $history->get($key);

            return [
                'supplier_id' => $key === 'null' ? null : (int) $key,
                'supplier' => (string) ($exp->supplier ?? $hist->supplier ?? 'Unknown'),
                'expense_laar' => (int) ($exp->expense_laar ?? 0),
                'history_spend_mvr' => round((float) ($hist->history_spend_mvr ?? 0), 2),
                'expense_count' => (int) ($exp->expense_count ?? 0),
            ];
        })
            ->sortByDesc('expense_laar')
            ->values()
            ->take(50)
            ->all();
    }

    /**
     * @return list<array{buyer_id: int|null, buyer: string, request_count: int, bought_laar: int}>
     */
    private function spendByBuyer(Carbon $from, Carbon $to): array
    {
        return PurchaseRequest::query()
            ->leftJoin('users as u', 'u.id', '=', 'purchase_requests.assigned_to')
            ->whereNotNull('purchase_requests.assigned_to')
            ->whereNotNull('purchase_requests.total_actual_laar')
            ->whereBetween('purchase_requests.updated_at', [$from, $to])
            ->whereIn('purchase_requests.status', [
                'bought_pending_verification', 'partially_bought', 'buying', 'received', 'closed',
            ])
            ->groupBy('purchase_requests.assigned_to', 'u.name')
            ->orderByDesc(DB::raw('SUM(purchase_requests.total_actual_laar)'))
            ->limit(50)
            ->get([
                'purchase_requests.assigned_to as buyer_id',
                DB::raw("COALESCE(u.name, 'Unknown') as buyer"),
                DB::raw('COUNT(*) as request_count'),
                DB::raw('SUM(purchase_requests.total_actual_laar) as bought_laar'),
            ])
            ->map(fn ($r) => [
                'buyer_id' => $r->buyer_id !== null ? (int) $r->buyer_id : null,
                'buyer' => (string) $r->buyer,
                'request_count' => (int) $r->request_count,
                'bought_laar' => (int) $r->bought_laar,
            ])
            ->all();
    }

    /**
     * @return list<array{inventory_item_id: int, item_name: string, date: string, avg_unit_price: float, min_unit_price: float, max_unit_price: float, samples: int}>
     */
    private function priceTrend(Carbon $from, Carbon $to, ?int $inventoryItemId): array
    {
        $q = SupplierPriceHistory::query()
            ->join('inventory_items as ii', 'ii.id', '=', 'supplier_price_history.inventory_item_id')
            ->whereBetween('supplier_price_history.recorded_at', [$from->toDateString(), $to->toDateString()]);

        if ($inventoryItemId) {
            $q->where('supplier_price_history.inventory_item_id', $inventoryItemId);
        } else {
            // Bound unbounded scans: top movers by sample count in range, then expand points
            $topIds = SupplierPriceHistory::query()
                ->whereBetween('recorded_at', [$from->toDateString(), $to->toDateString()])
                ->select('inventory_item_id', DB::raw('COUNT(*) as c'))
                ->groupBy('inventory_item_id')
                ->orderByDesc('c')
                ->limit(8)
                ->pluck('inventory_item_id');
            if ($topIds->isEmpty()) {
                return [];
            }
            $q->whereIn('supplier_price_history.inventory_item_id', $topIds);
        }

        return $q
            ->groupBy('supplier_price_history.inventory_item_id', 'ii.name', DB::raw('DATE(supplier_price_history.recorded_at)'))
            ->orderBy('ii.name')
            ->orderBy(DB::raw('DATE(supplier_price_history.recorded_at)'))
            ->limit(500)
            ->get([
                'supplier_price_history.inventory_item_id',
                'ii.name as item_name',
                DB::raw('DATE(supplier_price_history.recorded_at) as date'),
                DB::raw('AVG(supplier_price_history.unit_price) as avg_unit_price'),
                DB::raw('MIN(supplier_price_history.unit_price) as min_unit_price'),
                DB::raw('MAX(supplier_price_history.unit_price) as max_unit_price'),
                DB::raw('COUNT(*) as samples'),
            ])
            ->map(fn ($r) => [
                'inventory_item_id' => (int) $r->inventory_item_id,
                'item_name' => (string) $r->item_name,
                'date' => (string) $r->date,
                'avg_unit_price' => round((float) $r->avg_unit_price, 4),
                'min_unit_price' => round((float) $r->min_unit_price, 4),
                'max_unit_price' => round((float) $r->max_unit_price, 4),
                'samples' => (int) $r->samples,
            ])
            ->all();
    }

    /**
     * @return array{total_savings_laar: int, quote_picks: int, lines: list<array<string, mixed>>}
     */
    private function savings(Carbon $from, Carbon $to): array
    {
        $rows = PurchaseRequestItemQuote::query()
            ->join('purchase_request_items as pri', 'pri.id', '=', 'purchase_request_item_quotes.purchase_request_item_id')
            ->leftJoin('inventory_items as ii', 'ii.id', '=', 'pri.inventory_item_id')
            ->whereNotNull('purchase_request_item_quotes.selected_at')
            ->whereBetween('purchase_request_item_quotes.selected_at', [$from, $to])
            ->orderByDesc('purchase_request_item_quotes.selected_at')
            ->limit(100)
            ->get([
                'purchase_request_item_quotes.id',
                'purchase_request_item_quotes.unit_price_laar',
                'purchase_request_item_quotes.savings_laar',
                'purchase_request_item_quotes.selected_at',
                'purchase_request_item_quotes.supplier_name_text',
                'purchase_request_item_quotes.supplier_id',
                'pri.id as item_id',
                'pri.free_text_name',
                'ii.name as inventory_name',
                'pri.actual_qty',
            ]);

        $total = (int) $rows->sum(fn ($r) => (int) ($r->savings_laar ?? 0));

        return [
            'total_savings_laar' => $total,
            'quote_picks' => $rows->count(),
            'lines' => $rows->map(fn ($r) => [
                'quote_id' => (int) $r->id,
                'item_id' => (int) $r->item_id,
                'item_name' => (string) ($r->inventory_name ?: $r->free_text_name ?: 'Item'),
                'unit_price_laar' => (int) $r->unit_price_laar,
                'savings_laar' => (int) ($r->savings_laar ?? 0),
                'actual_qty' => $r->actual_qty !== null ? (float) $r->actual_qty : null,
                'selected_at' => Carbon::parse($r->selected_at)->toIso8601String(),
            ])->all(),
        ];
    }
}
