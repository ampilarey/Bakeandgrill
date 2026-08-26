<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\System\Services\SchedulerRunTracker;
use App\Domains\System\Services\SystemHealthService;
use Illuminate\Console\Command;

/**
 * Pings an optional external heartbeat URL (e.g. Healthchecks.io) so cron
 * silence is detected even when individual scheduled tasks fail quietly.
 *
 * The ping is conditional on the app being able to do work, not merely on cron
 * having run. On 2026-08-26 Redis died at 03:51 and was still dead nineteen
 * hours later: the scheduler itself was healthy the whole time, so it pinged
 * every minute, the monitor stayed green, and nobody learned that the queue
 * had stopped — order confirmations, staff alerts, live board updates and
 * outgoing webhooks all silently ceased. A dead-man's switch that only watches
 * its own pulse cannot report that.
 *
 * So: dependencies healthy → normal ping. Dependencies degraded → ping
 * `<url>/fail`, which Healthchecks.io alerts on immediately.
 */
class SchedulerHeartbeat extends Command
{
    protected $signature = 'scheduler:heartbeat';

    protected $description = 'Ping external scheduler heartbeat URL when configured';

    public function handle(SchedulerRunTracker $tracker, SystemHealthService $health): int
    {
        $tracker->recordLastRun('scheduler:heartbeat');

        // The scheduler ran, which is what this command records above. Whether
        // the *system* is well is a separate question, asked separately — and
        // never allowed to throw, or a wobbly dependency would take out the
        // heartbeat that is supposed to report it.
        try {
            $degraded = $health->degradedDependencies();
        } catch (\Throwable $e) {
            $degraded = ['health-check'];
            $this->warn('Dependency check itself failed: ' . $e->getMessage());
        }

        if ($degraded !== []) {
            $reason = 'degraded: ' . implode(', ', $degraded);
            $this->error($reason);

            if (trim((string) config('system.healthcheck_url', '')) === '') {
                $this->comment('HEALTHCHECK_URL not configured — no failure signal sent.');

                return self::FAILURE;
            }

            $tracker->pingExternalHeartbeatFailure($reason);

            return self::FAILURE;
        }

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
