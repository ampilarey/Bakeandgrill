<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\LegacyPurchaseSettlementService;
use Illuminate\Console\Command;

/**
 * Mark purchase orders placed before payment tracking existed as paid.
 *
 * Owner, 2026-09-21: "Why i see owed to suppliers in suppliers page" — then
 * "i dont know" when asked how to clear it, and "still same" after.
 *
 * Payment tracking shipped on 2026-09-21 and started every order at zero
 * paid, because there was nothing to read a history of payments from. So
 * every order placed before that counts as entirely unpaid however long
 * ago it was actually settled, and "Owed to suppliers" opens with a debt
 * the shop does not have.
 *
 * This shows that list and, only when asked twice, settles it. The same
 * work is a button on the payables card for anyone who would rather not
 * open a terminal; both go through LegacyPurchaseSettlementService, so the
 * list you are shown and the list that gets settled cannot drift apart.
 */
class SettleOldPurchaseOrders extends Command
{
    protected $signature = 'purchasing:settle-old-orders
        {--before= : Only orders placed before this date (default: the day payment tracking shipped)}
        {--except= : Comma-separated order numbers (or ids) to leave owing}
        {--apply : Actually mark them paid — without this nothing is changed}';

    protected $description = 'Settle purchase orders from before payment tracking existed, so "Owed to suppliers" starts from real debt';

    /** The same names the card's button and the service use. */
    public const TRACKING_STARTED = LegacyPurchaseSettlementService::TRACKING_STARTED;

    public const METHOD = LegacyPurchaseSettlementService::METHOD;

    public const REFERENCE = LegacyPurchaseSettlementService::REFERENCE;

    public function handle(LegacyPurchaseSettlementService $legacy): int
    {
        $raw = (string) $this->option('before');
        try {
            $before = $legacy->cutOff($raw);
        } catch (\Throwable) {
            $this->error("Could not read a date from --before={$raw}.");

            return self::FAILURE;
        }

        // Order numbers, because that is what the list below and the screen
        // both show; an id still works for anyone who has one.
        $except = collect(explode(',', (string) $this->option('except')))
            ->map(fn (string $ref) => trim($ref))
            ->filter()
            ->all();

        $orders = $legacy->owing($before, $except);

        if ($orders->isEmpty()) {
            $this->info("Nothing owing on orders placed before {$before->toDateString()}. The card is already showing real debt.");

            return self::SUCCESS;
        }

        $this->report($legacy->summarise($orders), $before);

        if (!$this->option('apply')) {
            $this->newLine();
            $this->warn('Nothing has been changed. Read the list above first.');
            $keep = $orders->take(2)->pluck('purchase_number')->implode(',');
            $this->line('  Settle them:      php artisan purchasing:settle-old-orders --apply');
            $this->line("  Keep some owing:  php artisan purchasing:settle-old-orders --apply --except={$keep}");

            return self::SUCCESS;
        }

        $settled = $legacy->settle($orders);
        $this->newLine();
        $this->info("Settled {$settled} order(s). \"Owed to suppliers\" now shows only what is really owed.");
        $this->line('Any of them still owing? Open the order and undo its payment.');

        return self::SUCCESS;
    }

    /** @param array{total: float, orders: int, suppliers: list<array<string, mixed>>} $summary */
    private function report(array $summary, \Carbon\CarbonImmutable $before): void
    {
        $this->line("Orders placed before {$before->toDateString()} that still show as owing:");
        $this->newLine();

        $this->table(
            ['Supplier', 'Orders', 'Owed (MVR)', 'Oldest', 'Oldest order'],
            array_map(fn (array $r) => [
                $r['name'],
                $r['orders'],
                number_format((float) $r['owed'], 2),
                (string) $r['oldest_date'],
                $r['oldest_number'],
            ], $summary['suppliers']),
        );

        $this->line(sprintf(
            'Total: MVR %s across %d order(s), %d supplier(s).',
            number_format($summary['total'], 2),
            $summary['orders'],
            count($summary['suppliers']),
        ));
    }
}
