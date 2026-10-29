<?php

declare(strict_types=1);

namespace App\Domains\Finance\Support;

use App\Models\BankStatementLine;
use App\Models\Device;
use App\Models\Payment;
use App\Models\SiteSetting;
use App\Models\User;
use App\Support\BusinessDay;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Each QR and card payment ticked against what really came in (owner,
 * 2026-10-28: "when customer pays with QR code they enter the bill amount on
 * their own … when paid by card cashier enter the amount in the card machine").
 * The cashier cannot see MPOS, so the owner checks in Admin: Matches, or
 * Different with the amount MPOS or the slip shows. A check never changes the
 * payment; it records what was seen, so a short payment can be chased and a
 * tender correction or refund made on the order. Cash is checked by the shift
 * count, transfers by the bank statement (Transfers tab).
 */
final class PaymentChecks
{
    /**
     * The tenders a person keys in by hand: the customer on QR and on a
     * transfer, the cashier on the card machine. A transfer the bank statement
     * matched (Transfers tab) counts as checked by the statement (owner,
     * 2026-10-29), so the same payment is never ticked twice.
     */
    public const METHODS = ['qr', 'card', 'card_pos', 'bank_transfer'];

    /** The method filter's three choices. */
    public const METHOD_GROUPS = ['qr' => ['qr'], 'card' => ['card', 'card_pos'], 'transfer' => ['bank_transfer']];

    public const MATCHED = 'matched';

    public const DIFFERENT = 'different';

    public const STATES = ['unchecked', self::MATCHED, self::DIFFERENT, 'checked', 'all'];

    public const SORTS = ['newest', 'oldest', 'amount_desc', 'amount_asc'];

    private const AMOUNT = 'COALESCE(payments.amount_laar, ROUND(payments.amount * 100))';

    private const AT = 'COALESCE(payments.processed_at, payments.created_at)';

    /** What the bank statement line matched to this payment says came in, if any. */
    private const STATEMENT = '(SELECT MAX(bsl.amount_laar) FROM bank_statement_lines bsl WHERE bsl.matched_payment_id = payments.id)';

    /** A hand check first, else the statement, else not checked. */
    private const STATE = 'CASE WHEN payments.check_status IS NOT NULL THEN payments.check_status'
        . ' WHEN ' . self::STATEMENT . " IS NULL THEN 'unchecked'"
        . ' WHEN ' . self::STATEMENT . ' = ' . self::AMOUNT . " THEN 'matched' ELSE 'different' END";

    private const SEEN = 'COALESCE(payments.checked_amount_laar, ' . self::STATEMENT . ')';

    private const GROUP = "CASE WHEN payments.method = 'qr' THEN 'qr' WHEN payments.method = 'bank_transfer' THEN 'transfer' ELSE 'card' END";

    /** Payments before this day were never checked and are not asked about. */
    public static function startDate(): ?string
    {
        $v = SiteSetting::get('payment_check_start_date');

        return is_string($v) && $v !== '' ? $v : null;
    }

    /**
     * @param array{from: string, to: string, method?: ?string, state?: ?string, user_id?: ?int, device_id?: ?int,
     *              min?: ?float, max?: ?float, q?: ?string, sort?: ?string, page?: ?int, per_page?: ?int} $f
     * @return array<string, mixed>
     */
    public function list(array $f): array
    {
        $base = $this->base($f);
        $state = $f['state'] ?? 'unchecked';
        $rows = $this->withState(clone $base, $state);

        match ($f['sort'] ?? 'newest') {
            'oldest' => $rows->orderByRaw(self::AT . ' asc'),
            'amount_desc' => $rows->orderByRaw(self::AMOUNT . ' desc'),
            'amount_asc' => $rows->orderByRaw(self::AMOUNT . ' asc'),
            default => $rows->orderByRaw(self::AT . ' desc'),
        };
        $rows->orderByDesc('payments.id');

        $perPage = min(200, max(10, (int) ($f['per_page'] ?? 50)));
        $page = $rows->with(['order:id,order_number,type,user_id,device_id', 'order.user:id,name', 'order.device:id,name', 'collectedBy:id,name'])
            ->paginate($perPage, ['payments.*', DB::raw(self::STATEMENT . ' as statement_laar')], 'page', max(1, (int) ($f['page'] ?? 1)));

        $checkers = User::whereIn('id', collect($page->items())->pluck('checked_by')->filter()->unique())->pluck('name', 'id');

        return [
            'range' => ['from' => $f['from'], 'to' => $f['to'], 'start_date' => self::startDate()],
            'summary' => $this->summary($base),
            'payments' => collect($page->items())->map(fn (Payment $p) => $this->row($p, $checkers->all()))->values()->all(),
            'meta' => ['page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $perPage],
            'choices' => $this->choices($f),
        ];
    }

    /** Matches, or Different with the amount seen. */
    public function mark(Payment $payment, string $result, ?float $seen, ?string $reference, ?string $note, int $userId): Payment
    {
        if (!self::isCheckable($payment)) {
            throw new InvalidArgumentException('Only paid QR, card and transfer payments are checked here.');
        }
        if (BankStatementLine::where('matched_payment_id', $payment->id)->exists()) {
            throw new InvalidArgumentException('The bank statement already matched this transfer. Change it on the Transfers tab.');
        }
        $amount = self::amountLaar($payment);
        if ($result === self::MATCHED) {
            $seenLaar = $amount;
        } elseif ($result === self::DIFFERENT) {
            if ($seen === null) {
                throw new InvalidArgumentException('Type the amount MPOS, the card slip or the bank shows.');
            }
            $seenLaar = (int) round($seen * 100);
            if ($seenLaar === $amount) {
                throw new InvalidArgumentException('That is the same amount. Tap Matches instead.');
            }
        } else {
            throw new InvalidArgumentException('Unknown result.');
        }

        $payment->forceFill([
            'check_status' => $result,
            'checked_amount_laar' => $seenLaar,
            'check_reference' => $reference !== null && trim($reference) !== '' ? trim($reference) : null,
            'check_note' => $note !== null && trim($note) !== '' ? trim($note) : null,
            'checked_by' => $userId,
            'checked_at' => now(),
        ])->save();

        return $payment;
    }

    public function undo(Payment $payment): Payment
    {
        $payment->forceFill([
            'check_status' => null, 'checked_amount_laar' => null, 'check_reference' => null,
            'check_note' => null, 'checked_by' => null, 'checked_at' => null,
        ])->save();

        return $payment;
    }

    /**
     * Many at once, Matches only: a Different always needs its own amount.
     *
     * @param list<int> $ids
     * @return int how many were marked
     */
    public function markManyMatched(array $ids, int $userId): int
    {
        $n = 0;
        Payment::whereIn('id', $ids)->whereNull('check_status')->whereRaw(self::STATEMENT . ' IS NULL')->get()->each(function (Payment $p) use ($userId, &$n) {
            if (self::isCheckable($p)) {
                $this->mark($p, self::MATCHED, null, null, null, $userId);
                $n++;
            }
        });

        return $n;
    }

    /** Not checked yet and from before today: what Needs attention counts. */
    public static function waitingQuery(): Builder
    {
        [$todayStart] = BusinessDay::bounds(BusinessDay::todayYmd());
        $q = self::checkable()->whereRaw(self::STATE . " = 'unchecked'")->whereRaw(self::AT . ' < ?', [$todayStart]);
        if ($start = self::startDate()) {
            $q->whereRaw(self::AT . ' >= ?', [BusinessDay::bounds($start)[0]]);
        }

        return $q;
    }

    public static function isCheckable(Payment $p): bool
    {
        return in_array((string) $p->method, self::METHODS, true)
            && in_array((string) $p->status, SettlementChannels::SETTLED_STATUSES, true)
            && $p->order_id !== null;
    }

    public static function amountLaar(Payment $p): int
    {
        return (int) ($p->amount_laar ?? round((float) $p->amount * 100));
    }

    private static function checkable(): Builder
    {
        return Payment::query()
            ->whereIn('payments.method', self::METHODS)
            ->whereIn('payments.status', SettlementChannels::SETTLED_STATUSES)
            ->whereNotNull('payments.order_id');
    }

    /** Every filter but the state, which the summary splits by. */
    private function base(array $f): Builder
    {
        $from = $f['from'];
        if (($start = self::startDate()) && $start > $from) {
            $from = $start;
        }
        [$fromAt] = BusinessDay::bounds($from);
        [, $toAt] = BusinessDay::bounds($f['to']);

        $q = self::checkable()
            ->leftJoin('orders', 'orders.id', '=', 'payments.order_id')
            ->whereRaw(self::AT . ' between ? and ?', [$fromAt, $toAt]);

        if ($group = self::METHOD_GROUPS[$f['method'] ?? ''] ?? null) {
            $q->whereIn('payments.method', $group);
        }
        if ($uid = $f['user_id'] ?? null) {
            $q->where(fn ($w) => $w->where('payments.collected_by_user_id', $uid)
                ->orWhere(fn ($w2) => $w2->whereNull('payments.collected_by_user_id')->where('orders.user_id', $uid)));
        }
        if ($did = $f['device_id'] ?? null) {
            $q->where('orders.device_id', $did);
        }
        if (($min = $f['min'] ?? null) !== null) {
            $q->whereRaw(self::AMOUNT . ' >= ?', [(int) round($min * 100)]);
        }
        if (($max = $f['max'] ?? null) !== null) {
            $q->whereRaw(self::AMOUNT . ' <= ?', [(int) round($max * 100)]);
        }
        if (($text = trim((string) ($f['q'] ?? ''))) !== '') {
            $q->where(fn ($w) => $w->where('orders.order_number', 'like', "%{$text}%")
                ->orWhere('payments.check_reference', 'like', "%{$text}%")
                ->orWhere('payments.reference_number', 'like', "%{$text}%"));
        }

        return $q;
    }

    private function withState(Builder $q, string $state): Builder
    {
        return match ($state) {
            'unchecked', self::MATCHED, self::DIFFERENT => $q->whereRaw(self::STATE . ' = ?', [$state]),
            'checked' => $q->whereRaw(self::STATE . " <> 'unchecked'"),
            default => $q,
        };
    }

    /** @return array<string, mixed> */
    private function summary(Builder $base): array
    {
        $rows = (clone $base)->toBase()
            ->selectRaw(self::STATE . ' as state, ' . self::GROUP . ' as m, ' . self::AMOUNT . ' as amt, ' . self::SEEN . ' as seen');
        $t = fn () => DB::query()->fromSub($rows, 't');

        $byState = $t()->selectRaw("state, COUNT(*) as n, SUM(amt) as laar, SUM(CASE WHEN state = 'unchecked' THEN 0 ELSE seen - amt END) as diff")
            ->groupBy('state')->get()->keyBy('state');
        $byMethod = $t()->selectRaw("m, COUNT(*) as n, SUM(amt) as laar, SUM(CASE WHEN state = 'unchecked' THEN 1 ELSE 0 END) as unchecked")
            ->groupBy('m')->get()->keyBy('m');

        $state = fn (string $k) => ['count' => (int) ($byState[$k]->n ?? 0), 'laar' => (int) ($byState[$k]->laar ?? 0)];
        $method = fn (string $k) => ['count' => (int) ($byMethod[$k]->n ?? 0), 'laar' => (int) ($byMethod[$k]->laar ?? 0), 'unchecked' => (int) ($byMethod[$k]->unchecked ?? 0)];

        return [
            'unchecked' => $state('unchecked'),
            'matched' => $state(self::MATCHED),
            'different' => $state(self::DIFFERENT) + ['diff_laar' => (int) ($byState[self::DIFFERENT]->diff ?? 0)],
            'qr' => $method('qr'),
            'card' => $method('card'),
            'transfer' => $method('transfer'),
        ];
    }

    /** @param array<int, string> $checkers */
    private function row(Payment $p, array $checkers): array
    {
        $amount = self::amountLaar($p);
        $at = Carbon::parse($p->processed_at ?? $p->created_at);

        return [
            'id' => $p->id,
            'at' => $at->toIso8601String(),
            'method' => $p->method === 'qr' ? 'qr' : ($p->method === 'bank_transfer' ? 'transfer' : 'card'),
            'amount_laar' => $amount,
            'reference' => $p->reference_number,
            'order' => $p->order ? ['id' => $p->order->id, 'order_number' => $p->order->order_number, 'type' => $p->order->type] : null,
            'cashier' => $p->collectedBy?->name ?? $p->order?->user?->name,
            'station' => $p->order?->device?->name,
            'check' => $this->checkOf($p, $amount, $checkers),
        ];
    }

    /**
     * A hand check, else the bank statement's match (undone on the Transfers
     * tab, so it has no Undo here), else none.
     *
     * @param array<int, string> $checkers
     */
    private function checkOf(Payment $p, int $amount, array $checkers): ?array
    {
        if ($p->check_status !== null) {
            return [
                'status' => $p->check_status,
                'seen_laar' => $p->checked_amount_laar,
                'diff_laar' => (int) $p->checked_amount_laar - $amount,
                'reference' => $p->check_reference,
                'note' => $p->check_note,
                'by' => $checkers[$p->checked_by] ?? null,
                'at' => $p->checked_at?->toIso8601String(),
                'source' => 'hand',
            ];
        }
        $statement = $p->getAttribute('statement_laar');
        if ($statement === null) {
            return null;
        }
        $line = BankStatementLine::where('matched_payment_id', $p->id)->first(['txn_date', 'reference']);

        return [
            'status' => (int) $statement === $amount ? self::MATCHED : self::DIFFERENT,
            'seen_laar' => (int) $statement,
            'diff_laar' => (int) $statement - $amount,
            'reference' => $line?->reference,
            'note' => null,
            'by' => 'Bank statement',
            'at' => $line?->txn_date ? Carbon::parse($line->txn_date)->toIso8601String() : null,
            'source' => 'statement',
        ];
    }

    /** Who rang and where, among the period's QR and card payments. */
    private function choices(array $f): array
    {
        $ids = (clone $this->base(['from' => $f['from'], 'to' => $f['to']]))
            ->selectRaw('COALESCE(payments.collected_by_user_id, orders.user_id) as uid, orders.device_id as did')
            ->distinct()->get();

        return [
            'staff' => User::whereIn('id', $ids->pluck('uid')->filter()->unique())->orderBy('name')->get(['id', 'name'])
                ->map(fn ($u) => ['id' => (int) $u->id, 'name' => (string) $u->name])->values()->all(),
            'stations' => Device::whereIn('id', $ids->pluck('did')->filter()->unique())->orderBy('name')->get(['id', 'name'])
                ->map(fn ($d) => ['id' => (int) $d->id, 'name' => (string) $d->name])->values()->all(),
        ];
    }
}
