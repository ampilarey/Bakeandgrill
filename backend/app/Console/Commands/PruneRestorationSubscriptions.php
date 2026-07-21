<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\RestorationSubscription;
use Illuminate\Console\Command;

/**
 * Anonymise terminal-state restoration subscriptions (plan §14 / Stage 6).
 *
 * Retention window comes from `service_availability.restoration_retention_days`
 * (default 30 days). Rows are kept for reporting (notified_count on incidents)
 * but the mobile number is blanked and the IP hash cleared so the DB never
 * carries stale customer PII beyond the incident tail. Idempotent — re-running
 * on already-anonymised rows is a no-op.
 */
class PruneRestorationSubscriptions extends Command
{
    protected $signature = 'service-availability:prune-restoration-subscriptions';

    protected $description = 'Anonymise restoration subscriptions past their retention window (plan §14).';

    public function handle(): int
    {
        $days = (int) config('service_availability.restoration_retention_days', 30);
        if ($days <= 0) {
            $this->warn('Retention days is <= 0 — refusing to run to avoid wiping fresh data.');

            return self::INVALID;
        }

        $cutoff = now()->subDays($days);

        $updated = RestorationSubscription::query()
            ->whereIn('status', ['notified', 'failed'])
            ->where(function ($q) use ($cutoff) {
                $q->where('notified_at', '<', $cutoff)
                    ->orWhere('failed_at', '<', $cutoff);
            })
            ->where('normalized_mobile', '!=', '')
            ->update([
                'normalized_mobile' => '',
                'request_ip_hash' => null,
            ]);

        $this->info("Anonymised {$updated} restoration subscription(s) past {$days} days.");

        return self::SUCCESS;
    }
}
