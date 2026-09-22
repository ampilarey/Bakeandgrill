<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Purchase;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;

/**
 * Mark purchase orders placed before payment tracking existed as paid.
 *
 * Owner, 2026-09-21: "Why i see owed to suppliers in suppliers page" — then
 * "i dont know" when asked how to clear it.
 *
 * Payment tracking shipped on 2026-09-21 and started every order at zero
 * paid, because there was nothing to read a history of payments from. So
 * every order placed before that counts as entirely unpaid however long
 * ago it was actually settled, and "Owed to suppliers" opens with a debt
 * the shop does not have.
 *
 * This shows that list and, only when asked twice, settles it. It does not
 * claim a payment that did not happen: the payment method is recorded as
 * `pre-system` and the reference says so, and the date is the order's own,
 * not today's. An order that really is still owed can be put back with
 * Record payment's undo on the order itself.
 */
class SettleOldPurchaseOrders extends Command
{
    protected $signature = 'purchasing:settle-old-orders
        {--before= : Only orders placed before this date (default: the day payment tracking shipped)}
        {--except= : Comma-separated order numbers (or ids) to leave owing}
        {--apply : Actually mark them paid — without this nothing is changed}';

    protected $description = 'Settle purchase orders from before payment tracking existed, so "Owed to suppliers" starts from real debt';

    /** The day paid_amount arrived, defaulting every existing order to nothing paid. */
    public const TRACKING_STARTED = '2026-09-21';

    public const METHOD = 'pre-system';

    public const REFERENCE = 'Settled before payment tracking';

    public function handle(): int
    {
        $before = trim((string) ($this->option('before') ?: self::TRACKING_STARTED));
        try {
            $before = \Carbon\CarbonImmutable::parse($before)->startOfDay();
        } catch (\Throwable) {
            $this->error("Could not read a date from --before={$before}.");

            return self::FAILURE;
        }

        // Order numbers, because that is what the list above and the screen
        // both show; an id still works for anyone who has one.
        $except = collect(explode(',', (string) $this->option('except')))
            ->map(fn (string $ref) => trim($ref))
            ->filter()
            ->all();

        $orders = $this->owing($before, $except);

        if ($orders->isEmpty()) {
            $this->info("Nothing owing on orders placed before {$before->toDateString()}. The card is already showing real debt.");

            return self::SUCCESS;
        }

        $this->report($orders, $before);

        if (!$this->option('apply')) {
            $this->newLine();
            $this->warn('Nothing has been changed. Read the list above first.');
            $keep = $orders->take(2)->pluck('purchase_number')->implode(',');
            $this->line('  Settle them:      php artisan purchasing:settle-old-orders --apply');
            $this->line("  Keep some owing:  php artisan purchasing:settle-old-orders --apply --except={$keep}");

            return self::SUCCESS;
        }

        $settled = $this->settle($orders);
        $this->newLine();
        $this->info("Settled {$settled} order(s). \"Owed to suppliers\" now shows only what is really owed.");
        $this->line('Any of them still owing? Open the order and undo its payment.');

        return self::SUCCESS;
    }

    /**
     * @param list<string> $except
     * @return Collection<int, Purchase>
     */
    private function owing(\Carbon\CarbonImmutable $before, array $except): Collection
    {
        return Purchase::query()
            ->with('supplier:id,name')
            ->whereIn('status', Purchase::OWING_STATUSES)
            ->whereColumn('paid_amount', '<', 'total')
            ->whereDate('purchase_date', '<', $before->toDateString())
            ->when($except !== [], fn ($q) => $q->where(function ($w) use ($except) {
                $w->whereNotIn('purchase_number', $except)
                    ->whereNotIn('id', array_map('intval', array_filter($except, 'ctype_digit')) ?: [0]);
            }))
            ->orderBy('purchase_date')
            ->get()
            ->filter(fn (Purchase $p) => (float) $p->owed > 0.0)
            ->values();
    }

    /** @param Collection<int, Purchase> $orders */
    private function report(Collection $orders, \Carbon\CarbonImmutable $before): void
    {
        $this->line("Orders placed before {$before->toDateString()} that still show as owing:");
        $this->newLine();

        $rows = $orders
            ->groupBy(fn (Purchase $p) => $p->supplier?->name ?? (trim((string) $p->supplier_name_text) ?: 'Unknown shop'))
            ->map(fn (Collection $group, string $name) => [
                $name,
                $group->count(),
                number_format($group->sum(fn (Purchase $p) => (float) $p->owed), 2),
                (string) $group->min(fn (Purchase $p) => $p->purchase_date?->toDateString()),
                $group->sortBy('purchase_date')->first()->purchase_number,
            ])
            ->sortByDesc(fn (array $r) => (float) str_replace(',', '', $r[2]))
            ->values()
            ->all();

        $this->table(['Supplier', 'Orders', 'Owed (MVR)', 'Oldest', 'Oldest order'], $rows);
        $this->line(sprintf(
            'Total: MVR %s across %d order(s), %d supplier(s).',
            number_format($orders->sum(fn (Purchase $p) => (float) $p->owed), 2),
            $orders->count(),
            count($rows),
        ));
    }

    /** @param Collection<int, Purchase> $orders */
    private function settle(Collection $orders): int
    {
        $settled = 0;
        foreach ($orders as $order) {
            $order->forceFill([
                'paid_amount' => $order->total,
                // The order's own date, never today's: this is a record of
                // money that went out back then, not a payment made now.
                'paid_at' => $order->purchase_date,
                'payment_method' => self::METHOD,
                'payment_ref' => self::REFERENCE,
            ])->save();
            $settled++;
        }

        return $settled;
    }
}
