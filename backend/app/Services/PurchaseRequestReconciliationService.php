<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\CashMovement;
use App\Models\PurchaseRequest;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

final class PurchaseRequestReconciliationService
{
    public const CASH_CATEGORY = 'buying_float';

    /**
     * @return array{
     *     from: string,
     *     to: string,
     *     buyers: list<array<string, mixed>>,
     *     totals: array<string, int|float>
     * }
     */
    public function report(?string $from, ?string $to, ?int $buyerId = null): array
    {
        $fromDate = $from ? Carbon::parse($from)->startOfDay() : now()->startOfMonth();
        $toDate = $to ? Carbon::parse($to)->endOfDay() : now()->endOfDay();

        $prQuery = PurchaseRequest::query()
            ->with(['assignee:id,name', 'expense:id,expense_number,amount_laar,status', 'attachments'])
            ->whereNotNull('assigned_to')
            ->whereIn('status', ['bought_pending_verification', 'received', 'closed', 'partially_bought', 'buying'])
            ->whereBetween('updated_at', [$fromDate, $toDate]);

        if ($buyerId) {
            $prQuery->where('assigned_to', $buyerId);
        }

        $prs = $prQuery->get();
        $buyerIds = $prs->pluck('assigned_to')->unique()->filter()->values()->all();

        $cashByUser = CashMovement::query()
            ->where('type', 'cash_out')
            ->where('category', self::CASH_CATEGORY)
            ->whereBetween('created_at', [$fromDate, $toDate])
            ->when($buyerId, fn ($q) => $q->where('user_id', $buyerId))
            ->when($buyerIds !== [], fn ($q) => $q->whereIn('user_id', $buyerIds))
            ->select('user_id', DB::raw('SUM(amount) as total_mvr'), DB::raw('COUNT(*) as cnt'))
            ->groupBy('user_id')
            ->get()
            ->keyBy('user_id');

        $buyers = [];
        $sumBought = 0;
        $sumExpense = 0;
        $sumCashLaar = 0;
        $sumReceipts = 0;

        foreach ($prs->groupBy('assigned_to') as $uid => $group) {
            $bought = (int) $group->sum(fn (PurchaseRequest $pr) => (int) ($pr->total_actual_laar ?? 0));
            $expense = (int) $group->sum(fn (PurchaseRequest $pr) => (int) ($pr->expense?->amount_laar ?? 0));
            $receipts = (int) $group->sum(fn (PurchaseRequest $pr) => $pr->attachments
                ->where('type', 'receipt')
                ->count());
            $cashMvr = (float) ($cashByUser[$uid]->total_mvr ?? 0);
            $cashLaar = (int) round($cashMvr * 100);
            $user = $group->first()?->assignee;

            $buyers[] = [
                'buyer_id' => (int) $uid,
                'buyer_name' => $user?->name ?? 'Unknown',
                'request_count' => $group->count(),
                'bought_laar' => $bought,
                'expense_laar' => $expense,
                'cash_out_laar' => $cashLaar,
                'receipt_count' => $receipts,
                'bought_vs_expense_laar' => $bought - $expense,
                'cash_vs_bought_laar' => $cashLaar - $bought,
                'requests' => $group->map(fn (PurchaseRequest $pr) => [
                    'id' => $pr->id,
                    'request_no' => $pr->request_no,
                    'status' => $pr->status,
                    'total_actual_laar' => $pr->total_actual_laar,
                    'expense_number' => $pr->expense?->expense_number,
                    'expense_amount_laar' => $pr->expense?->amount_laar,
                    'receipt_count' => $pr->attachments->where('type', 'receipt')->count(),
                ])->values()->all(),
            ];

            $sumBought += $bought;
            $sumExpense += $expense;
            $sumCashLaar += $cashLaar;
            $sumReceipts += $receipts;
        }

        usort($buyers, fn ($a, $b) => strcmp($a['buyer_name'], $b['buyer_name']));

        return [
            'from' => $fromDate->toDateString(),
            'to' => $toDate->toDateString(),
            'buyers' => $buyers,
            'totals' => [
                'bought_laar' => $sumBought,
                'expense_laar' => $sumExpense,
                'cash_out_laar' => $sumCashLaar,
                'receipt_count' => $sumReceipts,
                'bought_vs_expense_laar' => $sumBought - $sumExpense,
                'cash_vs_bought_laar' => $sumCashLaar - $sumBought,
            ],
        ];
    }
}
