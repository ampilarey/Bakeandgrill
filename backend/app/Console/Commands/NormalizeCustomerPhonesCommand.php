<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Customer;
use App\Rules\MaldivesPhone;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Backfill customers.phone (and gift_card_purchases.recipient_phone) to +960XXXXXXX.
 * Invalid numbers are reported and left unchanged.
 */
class NormalizeCustomerPhonesCommand extends Command
{
    protected $signature = 'customers:normalize-phones
        {--dry-run : Report changes without writing}
        {--limit=0 : Max rows to update (0 = all)}';

    protected $description = 'Normalize customer / gift-card recipient phones to +960XXXXXXX';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $limit = max(0, (int) $this->option('limit'));

        $updated = 0;
        $skippedOk = 0;
        $invalid = 0;
        $conflicts = 0;

        $query = Customer::query()->whereNotNull('phone')->where('phone', '!=', '');
        if ($limit > 0) {
            $query->limit($limit);
        }

        foreach ($query->cursor() as $customer) {
            $raw = trim((string) $customer->phone);
            if ($raw === '') {
                continue;
            }

            try {
                $normalized = MaldivesPhone::normalize($raw);
            } catch (\InvalidArgumentException) {
                $invalid++;
                $this->warn("invalid customer #{$customer->id}: {$raw}");

                continue;
            }

            if ($normalized === $raw) {
                $skippedOk++;

                continue;
            }

            $clash = Customer::query()
                ->where('phone', $normalized)
                ->where('id', '!=', $customer->id)
                ->exists();

            if ($clash) {
                $conflicts++;
                $this->warn("conflict customer #{$customer->id}: {$raw} → {$normalized} (already taken)");

                continue;
            }

            $this->line(($dryRun ? '[dry-run] ' : '') . "customer #{$customer->id}: {$raw} → {$normalized}");

            if (!$dryRun) {
                $customer->update(['phone' => $normalized]);
            }
            $updated++;
        }

        $purchaseUpdated = $this->normalizeGiftCardPurchasePhones($dryRun, $limit);

        $this->newLine();
        $this->info(($dryRun ? 'Dry-run ' : '') . 'customers: '
            . "updated={$updated} already_ok={$skippedOk} invalid={$invalid} conflicts={$conflicts}");
        $this->info(($dryRun ? 'Dry-run ' : '') . "gift_card_purchases.recipient_phone updated={$purchaseUpdated}");

        return self::SUCCESS;
    }

    private function normalizeGiftCardPurchasePhones(bool $dryRun, int $limit): int
    {
        $updated = 0;
        $query = DB::table('gift_card_purchases')
            ->whereNotNull('recipient_phone')
            ->where('recipient_phone', '!=', '');

        if ($limit > 0) {
            $query->limit($limit);
        }

        foreach ($query->orderBy('id')->cursor() as $row) {
            $raw = trim((string) $row->recipient_phone);
            if ($raw === '') {
                continue;
            }

            try {
                $normalized = MaldivesPhone::normalize($raw);
            } catch (\InvalidArgumentException) {
                $this->warn("invalid purchase #{$row->id}: {$raw}");

                continue;
            }

            if ($normalized === $raw) {
                continue;
            }

            $this->line(($dryRun ? '[dry-run] ' : '') . "purchase #{$row->id}: {$raw} → {$normalized}");

            if (!$dryRun) {
                DB::table('gift_card_purchases')
                    ->where('id', $row->id)
                    ->update(['recipient_phone' => $normalized]);
            }
            $updated++;
        }

        return $updated;
    }
}
