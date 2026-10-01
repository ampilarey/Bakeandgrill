<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\SocialLinkVisit;
use Illuminate\Console\Command;

/**
 * Tracked-link visits older than N days go (Social Hub audit, 2026-10-01).
 * One row per visitor per post per hour, kept for ever, is a table that only
 * grows; the digest and the post counters look back a few weeks at most.
 */
class PruneSocialVisits extends Command
{
    protected $signature = 'social:prune-visits {--days=180}';

    protected $description = 'Delete tracked social link visits older than the retention window';

    public function handle(): int
    {
        $days = max(30, (int) $this->option('days'));
        $deleted = SocialLinkVisit::query()->where('created_at', '<', now()->subDays($days))->delete();
        $this->info("Deleted {$deleted} visit" . ($deleted === 1 ? '' : 's') . " older than {$days} days.");

        return self::SUCCESS;
    }
}
