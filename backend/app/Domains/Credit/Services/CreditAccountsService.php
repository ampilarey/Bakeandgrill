<?php

declare(strict_types=1);

namespace App\Domains\Credit\Services;

use App\Models\Customer;
use App\Models\CustomerCreditLedger;
use App\Models\Invoice;
use Illuminate\Database\Eloquent\Builder;

/**
 * Every credit account on one page (owner, 2026-10-05: "Is there any place
 * to manage credit accounts" — there was not; each account lived behind
 * its own customer). Lists customers who have credit, or ever owed on it,
 * with what the owner asks of each at a glance: status, limit, balance,
 * terms, how overdue, when they last paid.
 */
final class CreditAccountsService
{
    public const FILTERS = ['all', 'active', 'on_hold', 'blocked', 'overdue', 'with_balance'];

    public function __construct(private readonly CreditEligibilityService $eligibility) {}

    /**
     * @return array{data: list<array<string, mixed>>, total: int, page: int, per_page: int, totals: array<string, mixed>}
     */
    public function list(string $filter, string $q, int $page, int $perPage = 50): array
    {
        $today = now()->toDateString();
        $base = Customer::query()
            ->where(fn (Builder $w) => $w->where('credit_enabled', true)
                ->orWhere('credit_balance_laar', '!=', 0)
                // Once approved, always listed: a blocked account that owes
                // nothing is still one the owner may want to reopen.
                ->orWhereNotNull('credit_approved_at'));

        $query = (clone $base);
        $q = trim($q);
        if ($q !== '') {
            $like = '%' . mb_strtolower($q) . '%';
            $digits = preg_replace('/\D/', '', $q) ?? '';
            $query->where(function (Builder $w) use ($like, $digits): void {
                $w->whereRaw('LOWER(name) LIKE ?', [$like]);
                if ($digits !== '') {
                    $w->orWhere('phone', 'like', '%' . $digits . '%');
                }
            });
        }

        // Overdue: an open credit invoice past its due date.
        $overdueIds = Invoice::query()
            ->select('customer_id')
            ->where('type', 'sale')
            ->whereIn('status', ['sent', 'overdue'])
            ->whereRaw(Invoice::OPEN_BALANCE_SQL)
            ->whereNotNull('due_date')
            ->where('due_date', '<', $today)
            ->whereNotNull('customer_id')
            ->distinct();

        match ($filter) {
            'active' => $query->where('credit_enabled', true)->where('credit_status', 'active'),
            'on_hold' => $query->where('credit_enabled', true)->where('credit_status', 'on_hold'),
            'blocked' => $query->where(fn (Builder $w) => $w->where('credit_enabled', false)->orWhere('credit_status', 'blocked')),
            'overdue' => $query->whereIn('id', $overdueIds),
            'with_balance' => $query->where('credit_balance_laar', '>', 0),
            default => null,
        };

        $total = (clone $query)->count();
        $rows = $query
            ->orderByDesc('credit_balance_laar')
            ->orderBy('name')
            ->forPage($page, $perPage)
            ->get();

        $ids = $rows->pluck('id');
        $overdue = $ids->isEmpty() ? collect() : Invoice::query()
            ->selectRaw('customer_id, COUNT(*) as cnt, MIN(due_date) as oldest_due, SUM(total_laar - amount_paid_laar - credited_laar - written_off_laar) as overdue_laar')
            ->whereIn('customer_id', $ids)
            ->where('type', 'sale')
            ->whereIn('status', ['sent', 'overdue'])
            ->whereRaw(Invoice::OPEN_BALANCE_SQL)
            ->whereNotNull('due_date')
            ->where('due_date', '<', $today)
            ->groupBy('customer_id')
            ->get()
            ->keyBy('customer_id');
        $openCounts = $ids->isEmpty() ? collect() : Invoice::query()
            ->selectRaw('customer_id, COUNT(*) as cnt')
            ->whereIn('customer_id', $ids)
            ->where('type', 'sale')
            ->whereIn('status', ['sent', 'overdue'])
            ->whereRaw(Invoice::OPEN_BALANCE_SQL)
            ->groupBy('customer_id')
            ->pluck('cnt', 'customer_id');
        $lastPaid = $ids->isEmpty() ? collect() : CustomerCreditLedger::query()
            ->selectRaw('customer_id, MAX(created_at) as at')
            ->whereIn('customer_id', $ids)
            ->where('type', 'payment')
            ->groupBy('customer_id')
            ->pluck('at', 'customer_id');
        $lastCharged = $ids->isEmpty() ? collect() : CustomerCreditLedger::query()
            ->selectRaw('customer_id, MAX(created_at) as at')
            ->whereIn('customer_id', $ids)
            ->where('type', 'charge')
            ->groupBy('customer_id')
            ->pluck('at', 'customer_id');

        $data = $rows->map(function (Customer $c) use ($overdue, $openCounts, $lastPaid, $lastCharged): array {
            $o = $overdue[$c->id] ?? null;
            $balance = (int) $c->credit_balance_laar;

            return [
                'id' => $c->id,
                'name' => (string) $c->name,
                'phone' => $c->phone,
                'sms_opt_out' => (bool) $c->sms_opt_out,
                'reminder_sms' => (bool) ($c->credit_reminder_sms ?? true),
                'enabled' => (bool) $c->credit_enabled,
                'status' => $c->credit_enabled ? ($c->credit_status ?? 'blocked') : 'blocked',
                'limit_mvr' => round((int) $c->credit_limit_laar / 100, 2),
                'balance_mvr' => round($balance / 100, 2),
                'available_mvr' => round($this->eligibility->availableCreditLaar($c) / 100, 2),
                'terms_days' => (int) ($c->credit_payment_terms_days ?? CreditEligibilityService::DEFAULT_PAYMENT_TERMS_DAYS),
                'open_invoices' => (int) ($openCounts[$c->id] ?? 0),
                'overdue_invoices' => (int) ($o->cnt ?? 0),
                'overdue_mvr' => round((int) ($o->overdue_laar ?? 0) / 100, 2),
                'oldest_due_date' => $o?->oldest_due ? substr((string) $o->oldest_due, 0, 10) : null,
                'last_paid_at' => $lastPaid[$c->id] ?? null,
                'last_charged_at' => $lastCharged[$c->id] ?? null,
                'approved_at' => $c->credit_approved_at?->toDateString(),
            ];
        })->values()->all();

        $all = (clone $base);

        return [
            'data' => $data,
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'totals' => [
                'accounts' => (clone $all)->count(),
                'active' => (clone $all)->where('credit_enabled', true)->where('credit_status', 'active')->count(),
                'on_hold' => (clone $all)->where('credit_enabled', true)->where('credit_status', 'on_hold')->count(),
                'blocked' => (clone $all)->where(fn (Builder $w) => $w->where('credit_enabled', false)->orWhere('credit_status', 'blocked'))->count(),
                'with_balance' => (clone $all)->where('credit_balance_laar', '>', 0)->count(),
                'overdue' => (clone $all)->whereIn('id', $overdueIds)->count(),
                'balance_mvr' => round((int) (clone $all)->where('credit_balance_laar', '>', 0)->sum('credit_balance_laar') / 100, 2),
                'overdue_mvr' => round((int) Invoice::query()
                    ->selectRaw('COALESCE(SUM(total_laar - amount_paid_laar - credited_laar - written_off_laar), 0) as s')
                    ->where('type', 'sale')->whereIn('status', ['sent', 'overdue'])->whereRaw(Invoice::OPEN_BALANCE_SQL)
                    ->whereNotNull('due_date')->where('due_date', '<', $today)->whereNotNull('customer_id')
                    ->value('s') / 100, 2),
            ],
        ];
    }
}
