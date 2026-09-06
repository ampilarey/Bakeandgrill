<?php

declare(strict_types=1);

namespace App\Domains\Finance\Services;

use App\Domains\Finance\Support\SettlementChannels;
use App\Models\BankStatementLine;
use App\Models\CashHandover;
use App\Models\Payment;
use App\Models\Shift;
use App\Support\BusinessDay;
use App\Support\PaymentMethodLabel;
use Carbon\Carbon;
use Carbon\CarbonImmutable;

/**
 * Does the money in the bank match what the till says?
 *
 * Owner, 2026-09-07: card and QR takings reach one account a day or more
 * later, sometimes half at a time; transfers reach another account line by
 * line; cash is counted and handed over. Nobody can tell from a statement
 * which day a deposit was for, so this does not try. Deposits are applied to
 * the oldest unsettled day first, and what is left is what the bank still
 * owes. A day is settled when its share has arrived, partly settled when
 * some has, awaiting while it is recent, and overdue once it is older than
 * the alert window with money still missing.
 */
final class SettlementLedgerService
{
    // ── Card & QR ────────────────────────────────────────────────────────────

    /**
     * @return array{
     *   start: ?string, from: string, to: string,
     *   days: list<array<string, mixed>>, deposits: list<array<string, mixed>>,
     *   totals: array<string, mixed>, settings: array<string, mixed>
     * }
     */
    public function cardQr(string $from, string $to): array
    {
        $start = SettlementChannels::startDate();
        $tolerance = SettlementChannels::toleranceLaar();
        $alertDays = SettlementChannels::alertDays();
        $today = BusinessDay::todayYmd();

        // Allocation must run from the very first tracked day, not from the
        // window the screen is showing: a deposit in March may have been for
        // February. The window only decides which rows are returned.
        $ledgerFrom = $start ?? $this->earliestActivity(SettlementChannels::CARD_QR) ?? $from;
        if ($ledgerFrom > $from) {
            $from = $ledgerFrom;
        }

        $expectedByDay = $this->expectedByDay(SettlementChannels::CARD_QR_METHODS, $ledgerFrom, $to);
        $deposits = BankStatementLine::query()
            ->where('account', SettlementChannels::CARD_QR)
            ->where('match_status', '!=', BankStatementLine::MATCH_IGNORED)
            ->whereDate('txn_date', '>=', $ledgerFrom)
            ->whereDate('txn_date', '<=', $to)
            ->orderBy('txn_date')
            ->orderBy('id')
            ->get();

        // Every day from the ledger start to the window end, so a day with
        // takings but no deposit still shows as owed.
        $days = [];
        $cursor = CarbonImmutable::parse($ledgerFrom);
        $end = CarbonImmutable::parse($to);
        while ($cursor->lte($end)) {
            $ymd = $cursor->toDateString();
            $row = $expectedByDay[$ymd] ?? ['gross' => 0, 'commission' => 0, 'count' => 0];
            $days[$ymd] = [
                'date' => $ymd,
                'gross_laar' => $row['gross'],
                'commission_laar' => $row['commission'],
                'expected_laar' => $row['gross'] - $row['commission'],
                'payments' => $row['count'],
                'allocated_laar' => 0,
                'deposits' => [],
            ];
            $cursor = $cursor->addDay();
        }

        // Oldest unsettled day first. A deposit cannot pay for a day after
        // its own date.
        $depositRows = [];
        foreach ($deposits as $line) {
            $remaining = (int) $line->amount_laar;
            $applied = [];
            foreach ($days as $ymd => &$day) {
                if ($remaining <= 0) {
                    break;
                }
                if ($ymd > $line->txn_date->toDateString()) {
                    break;
                }
                $owed = $day['expected_laar'] - $day['allocated_laar'];
                if ($owed <= 0) {
                    continue;
                }
                $take = min($owed, $remaining);
                $day['allocated_laar'] += $take;
                $day['deposits'][] = ['line_id' => $line->id, 'date' => $line->txn_date->toDateString(), 'amount_laar' => $take];
                $applied[] = ['date' => $ymd, 'amount_laar' => $take];
                $remaining -= $take;
            }
            unset($day);

            $depositRows[] = [
                'id' => $line->id,
                'date' => $line->txn_date->toDateString(),
                'description' => $line->description,
                'reference' => $line->reference,
                'amount_laar' => (int) $line->amount_laar,
                'applied_laar' => (int) $line->amount_laar - $remaining,
                'excess_laar' => $remaining,
                'applied_to' => $applied,
            ];
        }

        $totals = ['expected_laar' => 0, 'deposited_laar' => 0, 'outstanding_laar' => 0, 'excess_laar' => 0, 'overdue_days' => 0, 'oldest_open_date' => null];
        foreach ($days as $ymd => &$day) {
            $remaining = $day['expected_laar'] - $day['allocated_laar'];
            $age = (int) CarbonImmutable::parse($ymd)->diffInDays(CarbonImmutable::parse($today), false);
            $day['remaining_laar'] = max(0, $remaining);
            $day['age_days'] = max(0, $age);
            $day['status'] = $this->dayStatus($day['expected_laar'], $day['allocated_laar'], $remaining, $age, $tolerance, $alertDays);
            $totals['expected_laar'] += $day['expected_laar'];
            if ($remaining > $tolerance) {
                $totals['outstanding_laar'] += $remaining;
                $totals['oldest_open_date'] ??= $ymd;
            }
            if ($day['status'] === 'overdue') {
                $totals['overdue_days']++;
            }
        }
        unset($day);
        foreach ($depositRows as $d) {
            $totals['deposited_laar'] += $d['amount_laar'];
            $totals['excess_laar'] += $d['excess_laar'];
        }

        // Only the window the screen asked for, newest first.
        $visible = array_values(array_filter($days, fn ($d) => $d['date'] >= $from));
        usort($visible, fn ($a, $b) => strcmp($b['date'], $a['date']));
        $visibleDeposits = array_values(array_filter($depositRows, fn ($d) => $d['date'] >= $from));
        usort($visibleDeposits, fn ($a, $b) => strcmp($b['date'], $a['date']) ?: $b['id'] <=> $a['id']);

        return [
            'start' => $start,
            'from' => $from,
            'to' => $to,
            'days' => $visible,
            'deposits' => $visibleDeposits,
            'totals' => $totals,
            'settings' => ['tolerance_laar' => $tolerance, 'alert_days' => $alertDays, 'start_date' => $start],
        ];
    }

    private function dayStatus(int $expected, int $allocated, int $remaining, int $age, int $tolerance, int $alertDays): string
    {
        if ($expected <= 0) {
            return 'none';
        }
        if ($remaining <= $tolerance) {
            return 'settled';
        }
        if ($age > $alertDays) {
            return 'overdue';
        }

        return $allocated > 0 ? 'partial' : 'awaiting';
    }

    /**
     * Settled payments by business day, net of the commission already
     * stamped on each row.
     *
     * @param list<string> $methods
     * @return array<string, array{gross: int, commission: int, count: int}>
     */
    private function expectedByDay(array $methods, string $from, string $to): array
    {
        [$fromAt] = BusinessDay::bounds($from);
        [, $toAt] = BusinessDay::bounds($to);
        $tz = BusinessDay::timezone();

        $rows = Payment::query()
            ->whereIn('method', $methods)
            ->whereIn('status', SettlementChannels::SETTLED_STATUSES)
            ->where('amount', '>', 0)
            ->whereBetween(\Illuminate\Support\Facades\DB::raw('COALESCE(processed_at, created_at)'), [$fromAt, $toAt])
            ->get(['id', 'amount', 'amount_laar', 'commission_laar', 'processed_at', 'created_at']);

        $out = [];
        foreach ($rows as $p) {
            $at = Carbon::parse($p->processed_at ?? $p->created_at)->setTimezone($tz)->toDateString();
            $laar = (int) ($p->amount_laar ?? round((float) $p->amount * 100));
            $out[$at] ??= ['gross' => 0, 'commission' => 0, 'count' => 0];
            $out[$at]['gross'] += $laar;
            $out[$at]['commission'] += (int) ($p->commission_laar ?? 0);
            $out[$at]['count']++;
        }

        return $out;
    }

    private function earliestActivity(string $account): ?string
    {
        $line = BankStatementLine::query()->where('account', $account)->min('txn_date');
        $methods = $account === SettlementChannels::CARD_QR ? SettlementChannels::CARD_QR_METHODS : SettlementChannels::TRANSFER_METHODS;
        $payment = Payment::query()->whereIn('method', $methods)->whereIn('status', SettlementChannels::SETTLED_STATUSES)->min('processed_at');

        $candidates = array_values(array_filter([
            $line ? Carbon::parse((string) $line)->toDateString() : null,
            $payment ? Carbon::parse((string) $payment)->setTimezone(BusinessDay::timezone())->toDateString() : null,
        ]));
        sort($candidates);

        return $candidates[0] ?? null;
    }

    // ── Transfers ────────────────────────────────────────────────────────────

    /**
     * Each transfer payment with the statement line that proved it, plus the
     * statement lines nothing claims yet.
     */
    public function transfers(string $from, string $to): array
    {
        [$fromAt] = BusinessDay::bounds($from);
        [, $toAt] = BusinessDay::bounds($to);

        $payments = Payment::query()
            ->with(['order:id,order_number,customer_id', 'order.customer:id,name', 'invoice:id,invoice_number'])
            ->whereIn('method', SettlementChannels::TRANSFER_METHODS)
            ->whereIn('status', SettlementChannels::SETTLED_STATUSES)
            ->where('amount', '>', 0)
            ->whereBetween(\Illuminate\Support\Facades\DB::raw('COALESCE(processed_at, created_at)'), [$fromAt, $toAt])
            ->orderByDesc('processed_at')
            ->get();

        $matches = BankStatementLine::query()
            ->whereIn('matched_payment_id', $payments->pluck('id'))
            ->get()
            ->keyBy('matched_payment_id');

        $rows = $payments->map(function (Payment $p) use ($matches) {
            $line = $matches->get($p->id);

            return [
                'payment_id' => $p->id,
                'at' => Carbon::parse($p->processed_at ?? $p->created_at)->toIso8601String(),
                'amount_laar' => (int) ($p->amount_laar ?? round((float) $p->amount * 100)),
                'reference' => $p->reference_number,
                'order_number' => $p->order?->order_number,
                'invoice_number' => $p->invoice?->invoice_number,
                'customer' => $p->order?->customer?->name,
                'method_label' => PaymentMethodLabel::for((string) $p->method),
                'verified' => $line !== null,
                'line' => $line ? $this->lineRow($line) : null,
            ];
        })->values()->all();

        $unmatched = BankStatementLine::query()
            ->where('account', SettlementChannels::TRANSFER)
            ->where('match_status', BankStatementLine::MATCH_UNMATCHED)
            ->orderByDesc('txn_date')
            ->orderByDesc('id')
            ->get()
            ->map(fn (BankStatementLine $l) => $this->lineRow($l))
            ->values()
            ->all();

        return [
            'payments' => $rows,
            'unmatched_lines' => $unmatched,
            'totals' => [
                'payments' => count($rows),
                'verified' => count(array_filter($rows, fn ($r) => $r['verified'])),
                'unverified_laar' => array_sum(array_map(fn ($r) => $r['verified'] ? 0 : $r['amount_laar'], $rows)),
                'unmatched_lines' => count($unmatched),
            ],
        ];
    }

    /**
     * Pair a transfer-account line with the sale it paid for. Exactly one
     * settled transfer of the same amount within five days is a sure thing;
     * several are decided by the reference; anything else waits for a person.
     *
     * @return 'auto'|'unmatched'
     */
    public function autoMatchTransfer(BankStatementLine $line): string
    {
        if ($line->account !== SettlementChannels::TRANSFER || $line->matched_payment_id) {
            return $line->match_status;
        }

        $day = $line->txn_date;
        $candidates = Payment::query()
            ->whereIn('method', SettlementChannels::TRANSFER_METHODS)
            ->whereIn('status', SettlementChannels::SETTLED_STATUSES)
            ->whereRaw('COALESCE(amount_laar, ROUND(amount * 100)) = ?', [(int) $line->amount_laar])
            ->whereBetween(\Illuminate\Support\Facades\DB::raw('COALESCE(processed_at, created_at)'), [
                $day->copy()->subDays(5)->startOfDay(), $day->copy()->addDays(5)->endOfDay(),
            ])
            ->whereNotIn('id', BankStatementLine::query()->whereNotNull('matched_payment_id')->select('matched_payment_id'))
            ->get();

        $pick = null;
        if ($candidates->count() === 1) {
            $pick = $candidates->first();
        } elseif ($candidates->count() > 1) {
            $hay = strtolower(($line->description ?? '') . ' ' . ($line->reference ?? ''));
            $byRef = $candidates->filter(function (Payment $p) use ($hay) {
                $ref = strtolower(trim((string) $p->reference_number));

                return $ref !== '' && strlen($ref) >= 4 && str_contains($hay, $ref);
            });
            if ($byRef->count() === 1) {
                $pick = $byRef->first();
            }
        }

        if ($pick === null) {
            return BankStatementLine::MATCH_UNMATCHED;
        }

        $line->update(['matched_payment_id' => $pick->id, 'match_status' => BankStatementLine::MATCH_AUTO]);

        return BankStatementLine::MATCH_AUTO;
    }

    private function lineRow(BankStatementLine $l): array
    {
        return [
            'id' => $l->id,
            'date' => $l->txn_date->toDateString(),
            'description' => $l->description,
            'reference' => $l->reference,
            'amount_laar' => (int) $l->amount_laar,
            'match_status' => $l->match_status,
            'matched_payment_id' => $l->matched_payment_id,
        ];
    }

    // ── Cash ─────────────────────────────────────────────────────────────────

    /**
     * Per day: what the shifts counted, the float that stayed, what the
     * owner should have received and what they say they did.
     */
    public function cash(string $from, string $to): array
    {
        [$fromAt] = BusinessDay::bounds($from);
        [, $toAt] = BusinessDay::bounds($to);
        $tz = BusinessDay::timezone();

        $shifts = Shift::query()
            ->whereNotNull('closed_at')
            ->whereBetween('closed_at', [$fromAt, $toAt])
            ->orderBy('closed_at')
            ->get();

        $byDay = [];
        foreach ($shifts as $s) {
            $ymd = Carbon::parse($s->closed_at)->setTimezone($tz)->toDateString();
            $byDay[$ymd] ??= ['counted' => 0, 'expected' => 0, 'opening' => 0, 'shifts' => 0];
            $byDay[$ymd]['counted'] += (int) round((float) $s->closing_cash * 100);
            $byDay[$ymd]['expected'] += (int) round((float) $s->expected_cash * 100);
            $byDay[$ymd]['opening'] += (int) round((float) $s->opening_cash * 100);
            $byDay[$ymd]['shifts']++;
        }

        $handovers = CashHandover::query()
            ->with('receiver:id,name')
            ->whereDate('business_date', '>=', $from)
            ->whereDate('business_date', '<=', $to)
            ->get()
            ->keyBy(fn (CashHandover $h) => $h->business_date->toDateString());

        $days = [];
        $cursor = CarbonImmutable::parse($from);
        $end = CarbonImmutable::parse($to);
        while ($cursor->lte($end)) {
            $ymd = $cursor->toDateString();
            $t = $byDay[$ymd] ?? ['counted' => 0, 'expected' => 0, 'opening' => 0, 'shifts' => 0];
            /** @var CashHandover|null $h */
            $h = $handovers->get($ymd);
            // The float that stayed in the drawer: what the owner said, else
            // what the shifts opened with (assumed carried forward).
            $floatKept = $h?->float_kept_laar ?? $t['opening'];
            $expectedHandover = max(0, $t['counted'] - $floatKept);
            $received = $h?->amount_laar;
            $days[] = [
                'date' => $ymd,
                'shifts' => $t['shifts'],
                'counted_laar' => $t['counted'],
                'till_expected_laar' => $t['expected'],
                'till_variance_laar' => $t['counted'] - $t['expected'],
                'float_kept_laar' => $floatKept,
                'float_source' => $h?->float_kept_laar !== null ? 'entered' : 'shift_opening',
                'expected_handover_laar' => $expectedHandover,
                'received_laar' => $received,
                'difference_laar' => $received === null ? null : $received - $expectedHandover,
                'received_by' => $h?->receiver?->name,
                'notes' => $h?->notes,
                'status' => $t['shifts'] === 0 && $received === null ? 'none'
                    : ($received === null ? 'awaiting'
                        : (abs($received - $expectedHandover) <= SettlementChannels::toleranceLaar() ? 'settled' : 'differs')),
            ];
            $cursor = $cursor->addDay();
        }
        usort($days, fn ($a, $b) => strcmp($b['date'], $a['date']));

        return [
            'days' => $days,
            'totals' => [
                'expected_handover_laar' => array_sum(array_column($days, 'expected_handover_laar')),
                'received_laar' => array_sum(array_map(fn ($d) => $d['received_laar'] ?? 0, $days)),
                'awaiting_days' => count(array_filter($days, fn ($d) => $d['status'] === 'awaiting')),
                'differs_days' => count(array_filter($days, fn ($d) => $d['status'] === 'differs')),
            ],
        ];
    }
}
