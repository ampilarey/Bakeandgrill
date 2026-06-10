<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\System\Services\SchedulerRunTracker;
use Illuminate\Console\Command;

/**
 * Pings an optional external heartbeat URL (e.g. Healthchecks.io) so cron
 * silence is detected even when individual scheduled tasks fail quietly.
 */
class SchedulerHeartbeat extends Command
{
    protected $signature = 'scheduler:heartbeat';

    protected $description = 'Ping external scheduler heartbeat URL when configured';

    public function handle(SchedulerRunTracker $tracker): int
    {
        $tracker->recordLastRun('scheduler:heartbeat');

        if (!$tracker->pingExternalHeartbeat()) {
            if (trim((string) config('system.healthcheck_url', '')) === '') {
                $this->comment('HEALTHCHECK_URL not configured — heartbeat skipped.');
            } else {
                $this->error('External scheduler heartbeat ping failed.');

                return self::FAILURE;
            }
        } else {
            $this->info('External scheduler heartbeat pinged.');
        }

        return self::SUCCESS;
    }
}
