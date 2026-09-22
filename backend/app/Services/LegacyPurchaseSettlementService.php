<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Purchase;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Purchase orders that only look unpaid because payment tracking did not
 * exist when they were placed.
 *
 * Owner, 2026-09-21: "Why i see owed to suppliers in suppliers page." The
 * migration that added `paid_amount` started every order already on the
 * books at nothing paid, because there was no payment history to read. So
 * "Owed to suppliers" opened with 103 orders and MVR 33,271 of buying that
 * had mostly been settled in cash months before.
 *
 * Shared by the command and the button on the card, so the list you are
 * shown and the list that gets settled cannot be two different lists.
 */
class LegacyPurchaseSettlementService
{
    /** The day paid_amount arrived, defaulting every existing order to nothing paid. */
    public const TRACKING_STARTED = '2026-09-21';

    public const METHOD = 'pre-system';

    public const REFERENCE = 'Settled before payment tracking';

    /**
     * Orders placed before the cut-off that still show as owing.
     *
     * An order with no date of its own falls back to when it was entered:
     * `purchase_date` is nullable, and the payables card counts those while
     * a date filter would silently skip them, so the button would leave
     * behind exactly the rows the owner was asking about.
     *
     * @param list<string> $except Order numbers, or ids
     * @return Collection<int, Purchase>
     */
    public function owing(CarbonImmutable $before, array $except = []): Collection
    {
        $ids = array_values(array_map('intval', array_filter($except, 'ctype_digit')));

        return Purchase::query()
            ->with('supplier:id,name')
            ->whereIn('status', Purchase::OWING_STATUSES)
            ->whereColumn('paid_amount', '<', 'total')
            ->where(function ($q) use ($before) {
                $q->where('purchase_date', '<', $before->toDateString())
                    ->orWhere(fn ($w) => $w->whereNull('purchase_date')
                        ->where('created_at', '<', $before->toDateTimeString()));
            })
            ->when($except !== [], fn ($q) => $q->whereNotIn('purchase_number', $except))
            ->when($ids !== [], fn ($q) => $q->whereNotIn('id', $ids))
            ->orderBy('purchase_date')
            ->get()
            ->filter(fn (Purchase $p) => (float) $p->owed > 0.0)
            ->values();
    }

    /**
     * What settling would clear, per supplier, biggest first.
     *
     * @param Collection<int, Purchase> $orders
     * @return array{total: float, orders: int, suppliers: list<array<string, mixed>>}
     */
    public function summarise(Collection $orders): array
    {
        $suppliers = $orders
            ->groupBy(fn (Purchase $p) => $p->supplier?->name ?? (trim((string) $p->supplier_name_text) ?: 'Unknown shop'))
            ->map(fn (Collection $group, string $name) => [
                'name' => $name,
                'orders' => $group->count(),
                'owed' => round($group->sum(fn (Purchase $p) => (float) $p->owed), 2),
                'oldest_date' => $group->map(fn (Purchase $p) => $p->purchase_date?->toDateString())->filter()->min(),
                'oldest_number' => $group->sortBy('purchase_date')->first()->purchase_number,
            ])
            ->sortByDesc('owed')
            ->values()
            ->all();

        return [
            'total' => round($orders->sum(fn (Purchase $p) => (float) $p->owed), 2),
            'orders' => $orders->count(),
            'suppliers' => $suppliers,
        ];
    }

    /**
     * Mark them paid, without claiming a payment that did not happen: the
     * method says where the figure came from and the date is the order's
     * own, not today's, which would drop a season of old buying into this
     * week's numbers.
     *
     * @param Collection<int, Purchase> $orders
     * @return int how many were settled
     */
    public function settle(Collection $orders): int
    {
        $settled = 0;
        foreach ($orders as $order) {
            $order->forceFill([
                'paid_amount' => $order->total,
                'paid_at' => $order->purchase_date ?? $order->created_at?->toDateString(),
                'payment_method' => self::METHOD,
                'payment_ref' => self::REFERENCE,
            ])->save();
            $settled++;
        }

        return $settled;
    }

    /** The cut-off to use, falling back to the day tracking started. */
    public function cutOff(?string $before): CarbonImmutable
    {
        $raw = trim((string) ($before ?: self::TRACKING_STARTED));

        return CarbonImmutable::parse($raw)->startOfDay();
    }
}
