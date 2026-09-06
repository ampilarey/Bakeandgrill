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
 * line; cash is counted and handed over.
 *
 * A BML POS credit names the sales day it settles, so it is applied to that
 * day exactly — all of it, even past what the till expected, because a day
 * the bank paid more for than the till recorded is a finding, not noise.
 * Deposits from files that do not say are applied to the oldest unsettled
 * day first. What is left is what the bank still owes. A day is settled when
 * its share has arrived, partly settled when some has, awaiting while it is
 * recent, overdue once it is older than the alert window with money still
 * missing, and over when the bank paid more than the till took.
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
            // A credit the bank says was for a day before tracking began is
            // not this ledger's business.
            ->where(fn ($q) => $q->whereNull('for_date')->orWhereDate('for_date', '>=', $ledgerFrom))
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

        $depositRows = [];
        foreach ($deposits as $line) {
            $remaining = (int) $line->amount_laar;
            $applied = [];
            $for = $line->for_date?->toDateString();
            $txn = $line->txn_date->toDateString();

            if ($for !== null && isset($days[$for])) {
                // The bank named the day. All of it goes there — a day paid
                // more than the till took is exactly what the owner wants
                // to see.
                $days[$for]['allocated_laar'] += $remaining;
                $days[$for]['deposits'][] = ['line_id' => $line->id, 'date' => $txn, 'amount_laar' => $remaining];
                $applied[] = ['date' => $for, 'amount_laar' => $remaining];
                $remaining = 0;
            } else {
                // Oldest unsettled day first. A deposit cannot pay for a day
                // after its own date.
                foreach ($days as $ymd => &$day) {
                    if ($remaining <= 0) {
                        break;
                    }
                    if ($ymd > $txn) {
                        break;
                    }
                    $owed = $day['expected_laar'] - $day['allocated_laar'];
                    if ($owed <= 0) {
                        continue;
                    }
                    $take = min($owed, $remaining);
                    $day['allocated_laar'] += $take;
                    $day['deposits'][] = ['line_id' => $line->id, 'date' => $txn, 'amount_laar' => $take];
                    $applied[] = ['date' => $ymd, 'amount_laar' => $take];
                    $remaining -= $take;
                }
                unset($day);
            }

            $depositRows[] = [
                'id' => $line->id,
                'date' => $txn,
                'for_date' => $for,
                'kind' => $line->kind,
                'description' => $line->description,
                'reference' => $line->reference,
                'amount_laar' => (int) $line->amount_laar,
                'applied_laar' => (int) $line->amount_laar - $remaining,
                'excess_laar' => $remaining,
                'applied_to' => $applied,
            ];
        }

        $totals = [
            'expected_laar' => 0, 'deposited_laar' => 0, 'outstanding_laar' => 0, 'excess_laar' => 0, 'over_laar' => 0,
            'overdue_days' => 0, 'over_days' => 0, 'oldest_open_date' => null,
        ];
        foreach ($days as $ymd => &$day) {
            $remaining = $day['expected_laar'] - $day['allocated_laar'];
            $age = (int) CarbonImmutable::parse($ymd)->diffInDays(CarbonImmutable::parse($today), false);
            $day['remaining_laar'] = max(0, $remaining);
            $day['over_laar'] = max(0, -$remaining);
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
            if ($day['status'] === 'over') {
                $totals['over_days']++;
                $totals['over_laar'] += $day['over_laar'];
            }
        }
        unset($day);
        foreach ($depositRows as $d) {
            $totals['deposited_laar'] += $d['amount_laar'];
            $totals['excess_laar'] += $d['excess_laar'];
        }

        // Credits in this account that were not POS settlements (the owner
        // topping it up, a refund from a supplier) — shown, never counted,
        // unless someone restores one.
        $setAside = BankStatementLine::query()
            ->where('account', SettlementChannels::CARD_QR)
            ->where('match_status', BankStatementLine::MATCH_IGNORED)
            ->whereDate('txn_date', '>=', $from)
            ->whereDate('txn_date', '<=', $to)
            ->orderByDesc('txn_date')
            ->orderByDesc('id')
            ->get()
            ->map(fn (BankStatementLine $l) => $this->lineRow($l))
            ->values()
            ->all();

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
            'set_aside' => $setAside,
            'totals' => $totals,
            'settings' => ['tolerance_laar' => $tolerance, 'alert_days' => $alertDays, 'start_date' => $start],
        ];
    }

    private function dayStatus(int $expected, int $allocated, int $remaining, int $age, int $tolerance, int $alertDays): string
    {
        if ($expected <= 0 && $allocated <= 0) {
            return 'none';
        }
        if ($remaining < -$tolerance) {
            return 'over';
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
        $for = BankStatementLine::query()->where('account', $account)->whereNotNull('for_date')->min('for_date');
        $methods = $account === SettlementChannels::CARD_QR ? SettlementChannels::CARD_QR_METHODS : SettlementChannels::TRANSFER_METHODS;
        $payment = Payment::query()->whereIn('method', $methods)->whereIn('status', SettlementChannels::SETTLED_STATUSES)->min('processed_at');

        $candidates = array_values(array_filter([
            $line ? Carbon::parse((string) $line)->toDateString() : null,
            $for ? Carbon::parse((string) $for)->toDateString() : null,
            $payment ? Carbon::parse((string) $payment)->setTimezone(BusinessDay::timezone())->toDateString() : null,
        ]));
        sort($candidates);

        return $candidates[0] ?? null;
    }

    // ── Transfers ────────────────────────────────────────────────────────────

    /**
     * Each transfer payment with the statement line that proved it — and,
     * when the customer sent the wrong amount, by how much — plus the
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
            /** @var BankStatementLine|null $line */
            $line = $matches->get($p->id);
            $amount = (int) ($p->amount_laar ?? round((float) $p->amount * 100));
            $difference = $line ? (int) $line->amount_laar - $amount : null;

            return [
                'payment_id' => $p->id,
                'at' => Carbon::parse($p->processed_at ?? $p->created_at)->toIso8601String(),
                'amount_laar' => $amount,
                'reference' => $p->reference_number,
                'order_number' => $p->order?->order_number,
                'invoice_number' => $p->invoice?->invoice_number,
                'customer' => $p->order?->customer?->name,
                'method_label' => PaymentMethodLabel::for((string) $p->method),
                // verified: the bank has it, to the laari. short / over: the
                // customer sent the wrong amount. unverified: not seen yet.
                'status' => $difference === null ? 'unverified' : ($difference === 0 ? 'verified' : ($difference < 0 ? 'short' : 'over')),
                'verified' => $difference === 0,
                'difference_laar' => $difference,
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

        $mismatched = array_values(array_filter($rows, fn ($r) => $r['status'] === 'short' || $r['status'] === 'over'));

        return [
            'payments' => $rows,
            'unmatched_lines' => $unmatched,
            'totals' => [
                'payments' => count($rows),
                'verified' => count(array_filter($rows, fn ($r) => $r['verified'])),
                'unverified_laar' => array_sum(array_map(fn ($r) => $r['status'] === 'unverified' ? $r['amount_laar'] : 0, $rows)),
                'mismatched' => count($mismatched),
                'short_laar' => array_sum(array_map(fn ($r) => $r['status'] === 'short' ? -$r['difference_laar'] : 0, $mismatched)),
                'over_laar' => array_sum(array_map(fn ($r) => $r['status'] === 'over' ? $r['difference_laar'] : 0, $mismatched)),
                'unmatched_lines' => count($unmatched),
            ],
        ];
    }

    /**
     * Pair a transfer-account line with the sale it paid for.
     *
     * Same amount: exactly one settled transfer within five days is a sure
     * thing; several are narrowed to the day the customer sent it, then to
     * the sender's name against the customer, then to the reference.
     *
     * Wrong amount ($allowMismatch, run after every exact match has been
     * taken): the one transfer sale that day whose customer is the sender,
     * or the only transfer sale that day when this is the only credit left
     * for it. The line is linked so the difference is shown, not hidden.
     *
     * Anything else waits for a person.
     *
     * @return 'auto'|'unmatched'
     */
    public function autoMatchTransfer(BankStatementLine $line, bool $allowMismatch = false): string
    {
        if ($line->account !== SettlementChannels::TRANSFER || $line->matched_payment_id) {
            return $line->match_status;
        }

        $day = ($line->for_date ?? $line->txn_date)->toDateString();
        [$dayStart, $dayEnd] = BusinessDay::bounds($day);
        $at = \Illuminate\Support\Facades\DB::raw('COALESCE(processed_at, created_at)');
        $open = Payment::query()
            ->with(['order:id,customer_id', 'order.customer:id,name'])
            ->whereIn('method', SettlementChannels::TRANSFER_METHODS)
            ->whereIn('status', SettlementChannels::SETTLED_STATUSES)
            ->where('amount', '>', 0)
            ->whereNotIn('id', BankStatementLine::query()->whereNotNull('matched_payment_id')->select('matched_payment_id'));

        $exact = (clone $open)
            ->whereRaw('COALESCE(amount_laar, ROUND(amount * 100)) = ?', [(int) $line->amount_laar])
            ->whereBetween($at, [$dayStart->copy()->subDays(5), $dayEnd->copy()->addDays(5)])
            ->get();
        $onDay = fn (Payment $p) => Carbon::parse($p->processed_at ?? $p->created_at)->between($dayStart, $dayEnd);

        $pick = null;
        if ($exact->count() === 1) {
            $pick = $exact->first();
        } elseif ($exact->count() > 1) {
            $sameDay = $exact->filter($onDay);
            if ($sameDay->count() === 1) {
                $pick = $sameDay->first();
            } else {
                $pool = $sameDay->isNotEmpty() ? $sameDay : $exact;
                $byName = $this->bySender($pool, $line);
                if ($byName->count() === 1) {
                    $pick = $byName->first();
                } else {
                    $byRef = $this->byReference($pool, $line);
                    if ($byRef->count() === 1) {
                        $pick = $byRef->first();
                    }
                }
            }
        }

        if ($pick === null && $allowMismatch) {
            $sameDay = (clone $open)->whereBetween($at, [$dayStart, $dayEnd])->get();
            $byName = $this->bySender($sameDay, $line);
            if ($byName->count() === 1) {
                $pick = $byName->first();
            } elseif ($sameDay->count() === 1 && !$this->otherCreditsForDay($line, $day)) {
                $pick = $sameDay->first();
            }
        }

        if ($pick === null) {
            return BankStatementLine::MATCH_UNMATCHED;
        }

        $line->update(['matched_payment_id' => $pick->id, 'match_status' => BankStatementLine::MATCH_AUTO]);

        return BankStatementLine::MATCH_AUTO;
    }

    /** @param \Illuminate\Support\Collection<int, Payment> $pool */
    private function bySender(\Illuminate\Support\Collection $pool, BankStatementLine $line): \Illuminate\Support\Collection
    {
        $sender = $this->nameKey($line->counterparty);
        if ($sender === '') {
            return collect();
        }

        return $pool->filter(function (Payment $p) use ($sender) {
            $customer = $this->nameKey($p->order?->customer?->name);

            return $customer !== '' && (str_contains($sender, $customer) || str_contains($customer, $sender));
        });
    }

    /** @param \Illuminate\Support\Collection<int, Payment> $pool */
    private function byReference(\Illuminate\Support\Collection $pool, BankStatementLine $line): \Illuminate\Support\Collection
    {
        $hay = strtolower(($line->description ?? '') . ' ' . ($line->reference ?? ''));

        return $pool->filter(function (Payment $p) use ($hay) {
            $ref = strtolower(trim((string) $p->reference_number));

            return $ref !== '' && strlen($ref) >= 4 && str_contains($hay, $ref);
        });
    }

    private function nameKey(?string $name): string
    {
        return preg_replace('/[^a-z]/', '', strtolower((string) $name)) ?? '';
    }

    /** Is any other unmatched credit in the transfer account for the same day? */
    private function otherCreditsForDay(BankStatementLine $line, string $ymd): bool
    {
        return BankStatementLine::query()
            ->where('account', SettlementChannels::TRANSFER)
            ->where('match_status', BankStatementLine::MATCH_UNMATCHED)
            ->where('id', '!=', $line->id)
            ->where(fn ($q) => $q
                ->where(fn ($q2) => $q2->whereNotNull('for_date')->whereDate('for_date', $ymd))
                ->orWhere(fn ($q2) => $q2->whereNull('for_date')->whereDate('txn_date', $ymd)))
            ->exists();
    }

    private function lineRow(BankStatementLine $l): array
    {
        return [
            'id' => $l->id,
            'date' => $l->txn_date->toDateString(),
            'for_date' => $l->for_date?->toDateString(),
            'kind' => $l->kind,
            'description' => $l->description,
            'reference' => $l->reference,
            'counterparty' => $l->counterparty,
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
