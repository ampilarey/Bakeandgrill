<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Detailed page views older than N days go (2026-10-24). The visitor report
 * looks back 180 days at most; the daily totals in site_visits_daily, which
 * the dashboard reads, are kept for ever. Deleted in batches so a big table
 * never holds a long lock.
 */
class PruneVisitEvents extends Command
{
    protected $signature = 'visits:prune {--days=180}';

    protected $description = 'Delete detailed page views older than the retention window';

    public function handle(): int
    {
        $days = max(30, (int) $this->option('days'));
        $before = now()->subDays($days);
        $deleted = 0;
        do {
            $ids = DB::table('site_visit_events')->where('occurred_at', '<', $before)->orderBy('id')->limit(5000)->pluck('id');
            $deleted += $ids->isEmpty() ? 0 : DB::table('site_visit_events')->whereIn('id', $ids)->delete();
        } while ($ids->count() === 5000);
        $this->info("Deleted {$deleted} page view" . ($deleted === 1 ? '' : 's') . " older than {$days} days.");

        return self::SUCCESS;
    }
}
