<?php

declare(strict_types=1);

namespace App\Domains\Finance\Support;

use App\Models\Device;
use App\Models\Payment;
use App\Models\SiteSetting;
use App\Models\User;
use App\Support\BusinessDay;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
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
    /** The tenders a person keys in by hand: the customer on QR, the cashier on the card machine. */
    public const METHODS = ['qr', 'card', 'card_pos'];

    public const MATCHED = 'matched';

    public const DIFFERENT = 'different';

    public const STATES = ['unchecked', self::MATCHED, self::DIFFERENT, 'checked', 'all'];

    public const SORTS = ['newest', 'oldest', 'amount_desc', 'amount_asc'];

    private const AMOUNT = 'COALESCE(payments.amount_laar, ROUND(payments.amount * 100))';

    private const AT = 'COALESCE(payments.processed_at, payments.created_at)';

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
            ->paginate($perPage, ['payments.*'], 'page', max(1, (int) ($f['page'] ?? 1)));

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
            throw new InvalidArgumentException('Only paid QR and card payments are checked here.');
        }
        $amount = self::amountLaar($payment);
        if ($result === self::MATCHED) {
            $seenLaar = $amount;
        } elseif ($result === self::DIFFERENT) {
            if ($seen === null) {
                throw new InvalidArgumentException('Type the amount MPOS or the card slip shows.');
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
        Payment::whereIn('id', $ids)->whereNull('check_status')->get()->each(function (Payment $p) use ($userId, &$n) {
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
        $q = self::checkable()->whereNull('payments.check_status')->whereRaw(self::AT . ' < ?', [$todayStart]);
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

        if (($f['method'] ?? null) === 'qr') {
            $q->where('payments.method', 'qr');
        } elseif (($f['method'] ?? null) === 'card') {
            $q->whereIn('payments.method', ['card', 'card_pos']);
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
            'unchecked' => $q->whereNull('payments.check_status'),
            self::MATCHED, self::DIFFERENT => $q->where('payments.check_status', $state),
            'checked' => $q->whereNotNull('payments.check_status'),
            default => $q,
        };
    }

    /** @return array<string, mixed> */
    private function summary(Builder $base): array
    {
        $byState = (clone $base)
            ->selectRaw("COALESCE(payments.check_status, 'unchecked') as state, COUNT(*) as n, SUM(" . self::AMOUNT . ') as laar')
            ->selectRaw('SUM(COALESCE(payments.checked_amount_laar, 0) - CASE WHEN payments.check_status IS NULL THEN 0 ELSE ' . self::AMOUNT . ' END) as diff')
            ->groupByRaw("COALESCE(payments.check_status, 'unchecked')")
            ->get()->keyBy('state');
        $byMethod = (clone $base)
            ->selectRaw("CASE WHEN payments.method = 'qr' THEN 'qr' ELSE 'card' END as m, COUNT(*) as n, SUM(" . self::AMOUNT . ') as laar')
            ->selectRaw('SUM(CASE WHEN payments.check_status IS NULL THEN 1 ELSE 0 END) as unchecked')
            ->groupByRaw("CASE WHEN payments.method = 'qr' THEN 'qr' ELSE 'card' END")
            ->get()->keyBy('m');

        $state = fn (string $k) => ['count' => (int) ($byState[$k]->n ?? 0), 'laar' => (int) ($byState[$k]->laar ?? 0)];
        $method = fn (string $k) => ['count' => (int) ($byMethod[$k]->n ?? 0), 'laar' => (int) ($byMethod[$k]->laar ?? 0), 'unchecked' => (int) ($byMethod[$k]->unchecked ?? 0)];

        return [
            'unchecked' => $state('unchecked'),
            'matched' => $state(self::MATCHED),
            'different' => $state(self::DIFFERENT) + ['diff_laar' => (int) ($byState[self::DIFFERENT]->diff ?? 0)],
            'qr' => $method('qr'),
            'card' => $method('card'),
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
            'method' => $p->method === 'qr' ? 'qr' : 'card',
            'amount_laar' => $amount,
            'reference' => $p->reference_number,
            'order' => $p->order ? ['id' => $p->order->id, 'order_number' => $p->order->order_number, 'type' => $p->order->type] : null,
            'cashier' => $p->collectedBy?->name ?? $p->order?->user?->name,
            'station' => $p->order?->device?->name,
            'check' => $p->check_status === null ? null : [
                'status' => $p->check_status,
                'seen_laar' => $p->checked_amount_laar,
                'diff_laar' => (int) $p->checked_amount_laar - $amount,
                'reference' => $p->check_reference,
                'note' => $p->check_note,
                'by' => $checkers[$p->checked_by] ?? null,
                'at' => $p->checked_at?->toIso8601String(),
            ],
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
