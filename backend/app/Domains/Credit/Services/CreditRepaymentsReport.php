<?php

declare(strict_types=1);

namespace App\Domains\Credit\Services;

use App\Models\CustomerCreditLedger;
use App\Models\TradeAccount;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Every credit repayment in a date range, for matching against the till and
 * the bank statement (owner, 2026-10-06: "Add" — a daily list of repayments by
 * card and transfer, which touch no cash drawer and so showed up nowhere but
 * each customer's own history).
 *
 * Repayments are ledger rows of type "payment". The method says how the money
 * came: cash (into a shift drawer), card (the card machine), bank_transfer, or
 * card through BML when the row carries a gateway payment (the pay link).
 * Wholesale shops' repayments live in the same ledger and are marked as such.
 */
final class CreditRepaymentsReport
{
    public const METHODS = ['all', 'cash', 'card', 'bank_transfer', 'online'];

    /**
     * @return array{from: string, to: string, method: string, rows: list<array<string, mixed>>, totals: array<string, mixed>, truncated: bool}
     */
    public function build(Carbon $from, Carbon $to, string $method = 'all', string $q = '', int $limit = 2000): array
    {
        $tz = (string) config('app.timezone', 'Indian/Maldives');
        $start = $from->copy()->timezone($tz)->startOfDay();
        $end = $to->copy()->timezone($tz)->endOfDay();

        $base = CustomerCreditLedger::query()
            ->where('type', 'payment')
            // Timestamps are stored in the app's timezone (Male), so the day's
            // bounds are compared as written, not converted to UTC.
            ->whereBetween('created_at', [$start->format('Y-m-d H:i:s'), $end->format('Y-m-d H:i:s')]);

        $q = trim($q);
        if ($q !== '') {
            $like = '%' . mb_strtolower($q) . '%';
            $digits = preg_replace('/\D/', '', $q) ?? '';
            $base->whereHas('customer', function (Builder $c) use ($like, $digits): void {
                $c->where(function (Builder $w) use ($like, $digits): void {
                    $w->whereRaw('LOWER(name) LIKE ?', [$like]);
                    if ($digits !== '') {
                        $w->orWhere('phone', 'like', '%' . $digits . '%');
                    }
                });
            });
        }

        // Totals cover the whole range and search, before the method filter,
        // so the chips can show what each method came to.
        $all = (clone $base)->get(['id', 'amount_laar', 'method', 'payment_id']);
        $byMethod = ['cash' => 0, 'card' => 0, 'bank_transfer' => 0, 'online' => 0];
        $countBy = ['cash' => 0, 'card' => 0, 'bank_transfer' => 0, 'online' => 0];
        foreach ($all as $row) {
            $key = self::methodKey($row);
            $byMethod[$key] = ($byMethod[$key] ?? 0) + abs((int) $row->amount_laar);
            $countBy[$key] = ($countBy[$key] ?? 0) + 1;
        }

        $query = (clone $base);
        match ($method) {
            'online' => $query->whereNotNull('payment_id'),
            'card' => $query->whereNull('payment_id')->where('method', 'card'),
            'cash', 'bank_transfer' => $query->where('method', $method),
            default => null,
        };

        $rows = $query->with(['customer:id,name,phone', 'recordedBy:id,name'])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit($limit + 1)
            ->get();
        $truncated = $rows->count() > $limit;
        $rows = $rows->take($limit);

        $wholesale = $this->wholesaleCustomerIds($rows);
        $invoiceNumbers = $this->invoiceNumbers($rows);

        $data = $rows->map(function (CustomerCreditLedger $r) use ($tz, $wholesale, $invoiceNumbers): array {
            $applied = collect((array) ($r->applied_invoices ?? []))
                ->map(fn ($a) => $invoiceNumbers[(int) ($a['invoice_id'] ?? 0)] ?? null)
                ->filter()
                ->values()
                ->all();

            return [
                'id' => $r->id,
                'at' => $r->created_at?->timezone($tz)->format('Y-m-d H:i'),
                'date' => $r->created_at?->timezone($tz)->toDateString(),
                'customer_id' => $r->customer_id,
                'customer' => (string) ($r->customer?->name ?: 'Customer #' . $r->customer_id),
                'phone' => $r->customer?->phone,
                'channel' => isset($wholesale[$r->customer_id]) ? 'wholesale' : 'retail',
                'method' => self::methodKey($r),
                'method_label' => self::methodLabel(self::methodKey($r)),
                'amount_mvr' => round(abs((int) $r->amount_laar) / 100, 2),
                'balance_after_mvr' => round((int) $r->balance_after_laar / 100, 2),
                'reference' => $r->notes,
                'invoices' => $applied,
                'recorded_by' => $r->recordedBy?->name ?? ($r->payment_id ? 'Online' : null),
                'shift_id' => $r->shift_id,
            ];
        })->values()->all();

        $totalLaar = array_sum($byMethod);

        return [
            'from' => $start->toDateString(),
            'to' => $end->toDateString(),
            'method' => $method,
            'rows' => $data,
            'totals' => [
                'count' => $all->count(),
                'total_mvr' => round($totalLaar / 100, 2),
                'by_method' => collect($byMethod)->map(fn (int $laar, string $k) => [
                    'method' => $k,
                    'label' => self::methodLabel($k),
                    'count' => $countBy[$k],
                    'total_mvr' => round($laar / 100, 2),
                ])->values()->all(),
                // The figure to match against the bank: everything that did
                // not go into a cash drawer.
                'not_cash_mvr' => round(($totalLaar - $byMethod['cash']) / 100, 2),
            ],
            'truncated' => $truncated,
        ];
    }

    public static function methodKey(CustomerCreditLedger $row): string
    {
        if ($row->payment_id !== null) {
            return 'online';
        }

        return match ((string) $row->method) {
            'cash' => 'cash',
            'card' => 'card',
            'bank_transfer' => 'bank_transfer',
            default => 'card',
        };
    }

    public static function methodLabel(string $key): string
    {
        return match ($key) {
            'cash' => 'Cash',
            'card' => 'Card (machine)',
            'bank_transfer' => 'Bank transfer',
            'online' => 'Online (BML)',
            default => ucfirst(str_replace('_', ' ', $key)),
        };
    }

    /** @return array<int, true> */
    private function wholesaleCustomerIds(Collection $rows): array
    {
        $ids = $rows->pluck('customer_id')->filter()->unique()->values();
        if ($ids->isEmpty()) {
            return [];
        }

        return TradeAccount::query()->whereIn('customer_id', $ids)->pluck('customer_id')
            ->mapWithKeys(fn ($id) => [(int) $id => true])->all();
    }

    /** @return array<int, string> */
    private function invoiceNumbers(Collection $rows): array
    {
        $ids = $rows->flatMap(fn (CustomerCreditLedger $r) => collect((array) ($r->applied_invoices ?? []))->pluck('invoice_id'))
            ->filter()->map(fn ($v) => (int) $v)->unique()->values();
        if ($ids->isEmpty()) {
            return [];
        }

        return \App\Models\Invoice::query()->whereIn('id', $ids)->pluck('invoice_number', 'id')
            ->mapWithKeys(fn ($n, $id) => [(int) $id => (string) $n])->all();
    }
}
