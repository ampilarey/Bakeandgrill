<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Social\Services\SocialInsightsRefresher;
use Illuminate\Console\Command;

/**
 * Daily: fetch likes, comments and shares for posts published in the
 * last month on Facebook and Instagram, so the Posts tab can show which
 * posts worked.
 */
class RefreshSocialInsights extends Command
{
    protected $signature = 'social:refresh-insights {--days=30 : How far back to look}';

    protected $description = 'Fetch engagement numbers for recently published Facebook and Instagram posts';

    public function handle(SocialInsightsRefresher $refresher): int
    {
        $count = $refresher->refreshRecent(max(1, (int) $this->option('days')));
        $this->info("Refreshed insights for {$count} deliver" . ($count === 1 ? 'y' : 'ies') . '.');

        return self::SUCCESS;
    }
}
