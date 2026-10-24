<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Reporting\Support\VisitRetention;
use Illuminate\Console\Command;

/**
 * Applies the owner's automatic delete for the visitor report's detail
 * (Admin → Website visitors → Stored visit details; VisitRetention). Kept
 * for ever by default, so most nights this does nothing. The daily totals
 * the dashboard reads are never touched. --days overrides the setting.
 */
class PruneVisitEvents extends Command
{
    protected $signature = 'visits:prune {--days= : Delete detail older than this many days, whatever the setting says}';

    protected $description = 'Delete detailed page views older than the time set in Admin (kept for ever by default)';

    public function handle(): int
    {
        $days = $this->option('days') !== null ? max(30, (int) $this->option('days')) : VisitRetention::keepDays();
        if ($days === 0) {
            $this->info('Visit details are kept for ever; nothing deleted.');

            return self::SUCCESS;
        }
        $before = now(config('app.timezone', 'Indian/Maldives'))->subDays($days)->toDateString();
        $deleted = VisitRetention::deleteBefore($before);
        $this->info("Deleted {$deleted} page view" . ($deleted === 1 ? '' : 's') . " from before {$before}.");

        return self::SUCCESS;
    }
}
