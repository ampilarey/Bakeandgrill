<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\System\Services\QueueWorkerHeartbeat;
use App\Support\OwnerOpsAlert;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

/**
 * Texts the owner when the queue worker has gone quiet (operations audit,
 * 2026-10-01). The heartbeat was recorded every minute but nothing read it
 * except the health page, so a dead worker meant loyalty points, stock
 * deductions, campaign texts and outgoing webhooks quietly piling up.
 * Runs from cron, not the queue, so it still runs when the worker is down.
 */
class WatchQueueWorker extends Command
{
    protected $signature = 'ops:watch-queue-worker';

    protected $description = 'Alert the owner when the queue worker has stopped processing jobs';

    /** Twice the heartbeat's own stale window: one missed beat is not an outage. */
    public const QUIET_MINUTES = 10;

    private const UNKNOWN_SINCE_KEY = 'ops:queue-worker:unknown-since';

    public function handle(QueueWorkerHeartbeat $heartbeat): int
    {
        $last = $heartbeat->lastProcessedAt();

        if ($last === null) {
            // A cache flush wipes the heartbeat too; give the worker time to
            // write a fresh one before calling it down.
            $since = Cache::get(self::UNKNOWN_SINCE_KEY);
            if ($since === null) {
                Cache::put(self::UNKNOWN_SINCE_KEY, now()->toIso8601String(), now()->addDay());

                return self::SUCCESS;
            }
            $lastSeen = Carbon::parse((string) $since);
        } else {
            Cache::forget(self::UNKNOWN_SINCE_KEY);
            $lastSeen = Carbon::parse($last);
        }

        $quietFor = (int) $lastSeen->diffInMinutes(now());
        if ($quietFor < self::QUIET_MINUTES) {
            return self::SUCCESS;
        }

        OwnerOpsAlert::send(
            'queue-worker-down',
            sprintf(
                'Bake & Grill: the background worker has not run for %d minutes (since %s). Loyalty points, stock deduction and campaign texts are waiting. Running the deploy command restarts it.',
                $quietFor,
                $lastSeen->timezone(config('app.timezone'))->format('H:i'),
            ),
            180,
        );
        $this->warn("Queue worker quiet for {$quietFor} minutes.");

        return self::SUCCESS;
    }
}
