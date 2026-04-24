<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Alerts when queue jobs have been failing repeatedly.
 *
 * Runs every 15 minutes via scheduler. Any jobs that land in failed_jobs
 * within the past hour trigger a critical log and a Sentry capture so the
 * team is notified before customers notice missing emails, SMS, or webhooks.
 */
class AlertFailedJobs extends Command
{
    protected $signature = 'jobs:alert-failed
                            {--hours=1 : How far back to look for failed jobs}';

    protected $description = 'Alert on failed queue jobs (critical log + Sentry capture)';

    public function handle(): int
    {
        $hours = (int) $this->option('hours');
        $since = now()->subHours($hours)->toDateTimeString();

        $failed = DB::table('failed_jobs')
            ->where('failed_at', '>=', $since)
            ->orderByDesc('failed_at')
            ->limit(50)
            ->get(['id', 'uuid', 'queue', 'payload', 'exception', 'failed_at']);

        if ($failed->isEmpty()) {
            $this->info("No failed jobs in the last {$hours} hour(s).");

            return self::SUCCESS;
        }

        $count = $failed->count();

        $summary = $failed->map(function ($job) {
            $payload = json_decode($job->payload, true);

            return [
                'id' => $job->id,
                'uuid' => $job->uuid,
                'queue' => $job->queue,
                'job' => $payload['displayName'] ?? 'unknown',
                'failed_at' => $job->failed_at,
                'exception' => mb_substr($job->exception ?? '', 0, 120),
            ];
        })->toArray();

        Log::critical("AlertFailedJobs: {$count} job(s) failed in the last {$hours}h", [
            'count' => $count,
            'jobs' => $summary,
        ]);

        if (app()->bound('sentry')) {
            \Sentry\captureMessage(
                "[ALERT] {$count} queue job(s) failed in the last {$hours}h — check failed_jobs table",
                \Sentry\Severity::error(),
            );
        }

        $this->error("{$count} failed job(s) found in the last {$hours}h.");
        $this->table(
            ['ID', 'Queue', 'Job', 'Failed At'],
            collect($summary)->map(fn ($j) => [
                $j['id'], $j['queue'], $j['job'], $j['failed_at'],
            ])->toArray(),
        );

        return self::FAILURE;
    }
}
