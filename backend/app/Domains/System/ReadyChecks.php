<?php

declare(strict_types=1);

namespace App\Domains\System;

use App\Domains\System\Services\SchedulerRunTracker;
use App\Domains\System\Services\SystemHealthService;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\WebhookLog;
use App\Support\MailStatus;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Throwable;

/**
 * Can this site run unattended? (iruali import plan, feature 15.) One list of
 * checks, each pass, warn, fail or skip with one line on how to fix it, read by
 * `php artisan app:ready` over SSH and by System → Health (as "System status").
 *
 * The live checks (database, Redis, queue worker, scheduler, public storage)
 * come from SystemHealthService; this adds the settings and recent-activity
 * checks: mail, BML, SMS, backups, the restore drill, debug mode and the
 * TEST site's own Redis database. A check that throws becomes a fail with its
 * message, so one broken check never hides the others.
 */
final class ReadyChecks
{
    public const PASS = 'pass';

    public const WARN = 'warn';

    public const FAIL = 'fail';

    public const SKIP = 'skip';

    /** The site setting where `backup:restore-drill` leaves its last result (JSON). */
    public const DRILL_SETTING = 'system_restore_drill_last';

    /** A backup older than this many hours is a fail. */
    public const BACKUP_MAX_AGE_HOURS = 26;

    public function __construct(
        private readonly SystemHealthService $health,
        private readonly SchedulerRunTracker $runs,
    ) {}

    /**
     * @return list<array{key: string, label: string, status: string, detail: string, fix: string}>
     */
    public function run(): array
    {
        $checks = [
            'database' => ['Database', fn () => $this->live($this->health->checkDatabase(), 'The site cannot reach its database.', 'Check DB_* in .env and that MySQL is running.')],
            'redis' => ['Redis (cache and queue)', fn () => $this->live($this->health->checkRedis(), 'Redis did not answer.', 'Check REDIS_PATH or REDIS_HOST in .env; on cPanel, Redis is per account.')],
            'queue' => ['Queue worker', fn () => $this->live($this->health->checkQueueWorker(), 'No queue worker has been seen recently.', 'The deploy keeps it alive; run ./scripts/full-deploy.sh or start queue:work.')],
            'scheduler' => ['Scheduler', fn () => $this->live($this->health->checkScheduler(), 'Scheduled tasks are not running.', 'Check the cron line: * * * * * php artisan schedule:run.')],
            'storage' => ['Uploaded pictures', fn () => $this->live($this->health->checkPublicStorage(), 'Uploaded pictures cannot be served.', 'Run php artisan storage:link.')],
            'debug' => ['Debug mode', fn () => $this->debug()],
            'mail' => ['Email', fn () => $this->mail()],
            'bml' => ['Card payments (BML)', fn () => $this->bml()],
            'sms' => ['SMS', fn () => $this->sms()],
            'backup' => ['Nightly backup', fn () => $this->backup()],
            'restore_drill' => ['Backup restore drill', fn () => $this->restoreDrill()],
            'redis_separation' => ['TEST keeps its own Redis', fn () => $this->redisSeparation()],
        ];

        $out = [];
        foreach ($checks as $key => [$label, $check]) {
            try {
                [$status, $detail, $fix] = $check();
            } catch (Throwable $e) {
                [$status, $detail, $fix] = [self::FAIL, 'The check itself failed: ' . $e->getMessage(), 'See the log.'];
            }
            $out[] = ['key' => $key, 'label' => $label, 'status' => $status, 'detail' => $detail, 'fix' => $status === self::PASS ? '' : $fix];
        }

        return $out;
    }

    /** @param list<array{status: string}> $checks */
    public static function failures(array $checks): int
    {
        return count(array_filter($checks, fn (array $c) => $c['status'] === self::FAIL));
    }

    /** @param array{ok?: bool|null, error?: string|null, status?: string} $result */
    private function live(array $result, string $problem, string $fix): array
    {
        if (($result['ok'] ?? false) === true) {
            return [self::PASS, 'Working.', ''];
        }
        $why = trim((string) ($result['error'] ?? $result['status'] ?? ''));

        return [self::FAIL, $problem . ($why !== '' ? ' (' . $why . ')' : ''), $fix];
    }

    private function production(): bool
    {
        return app()->environment('production');
    }

    private function debug(): array
    {
        if ($this->production() && config('app.debug')) {
            return [self::FAIL, 'APP_DEBUG is on: errors show code and settings to visitors.', 'Set APP_DEBUG=false in .env, then php artisan config:cache.'];
        }

        return [self::PASS, 'Off' . ($this->production() ? '' : ' or not production (' . config('app.env') . ')') . '.', ''];
    }

    private function mail(): array
    {
        $problems = MailStatus::inspect()['problems'] ?? [];
        if ($problems === []) {
            return [self::PASS, 'Set up to send.', ''];
        }

        return [self::WARN, implode(' ', $problems), 'Fix MAIL_* in .env; php artisan mail:test sends one to check.'];
    }

    private function bml(): array
    {
        $missing = array_keys(array_filter([
            'BML_BASE_URL' => config('bml.base_url'),
            'BML_APP_ID' => config('bml.app_id'),
            'BML_API_KEY' => config('bml.api_key'),
            'BML_WEBHOOK_SECRET' => config('bml.webhook_secret'),
            'BML_RETURN_URL' => config('bml.return_url'),
        ], fn ($v) => blank($v)));
        if ($missing !== []) {
            return [$this->production() ? self::FAIL : self::WARN, 'Not set: ' . implode(', ', $missing) . '. Online card payments will not work.', 'Add the BML keys to .env, then php artisan config:cache.'];
        }
        $since = now()->subDay();
        $failed = WebhookLog::query()->where('gateway', 'bml')->where('status', 'failed')->where('created_at', '>=', $since)->count();
        $processed = WebhookLog::query()->where('gateway', 'bml')->where('status', 'processed')->where('created_at', '>=', $since)->count();
        if ($failed > 0 && $processed === 0) {
            return [self::WARN, "{$failed} BML payment callback(s) failed in the last day and none went through.", 'Check BML_WEBHOOK_SECRET and BML_WEBHOOK_URL, and the failures on System → Health.'];
        }

        return [self::PASS, 'Keys set (' . config('bml.environment') . ')' . ($processed > 0 ? ", {$processed} payment(s) in the last day." : '.'), ''];
    }

    private function sms(): array
    {
        $missing = array_keys(array_filter([
            'DHIRAAGU_API_URL' => config('services.dhiraagu.api_url'),
            'DHIRAAGU_SMS_USERNAME' => config('services.dhiraagu.username'),
            'DHIRAAGU_SMS_PASSWORD' => config('services.dhiraagu.password'),
        ], fn ($v) => blank($v)));
        if ($missing !== []) {
            return [$this->production() ? self::FAIL : self::WARN, 'Not set: ' . implode(', ', $missing) . '. Texts cannot be sent.', 'Add the Dhiraagu SMS keys to .env.'];
        }
        $recent = SmsLog::query()->whereIn('status', ['sent', 'failed'])->latest('id')->limit(10)->pluck('status')->all();
        if (count($recent) >= 5 && !in_array('sent', $recent, true)) {
            return [self::FAIL, 'The last ' . count($recent) . ' texts all failed.', 'Check the Dhiraagu account balance and password; System → Notifications → Log shows the errors.'];
        }

        return [self::PASS, 'Keys set' . ($recent !== [] ? '; the last texts went through.' : '.'), ''];
    }

    private function backup(): array
    {
        $last = $this->lastRun('backup:run');
        if ($last === null) {
            return [$this->production() ? self::WARN : self::SKIP, 'No finished backup recorded yet.', 'Backups run nightly from the scheduler; php artisan backup:run makes one now.'];
        }
        $hours = (int) floor($last->diffInMinutes(now()) / 60);
        if ($hours >= self::BACKUP_MAX_AGE_HOURS) {
            return [self::FAIL, "The last finished backup is {$hours} hours old.", 'Run php artisan backup:run and check the scheduler.'];
        }

        return [self::PASS, 'Last finished ' . $last->diffForHumans() . '.', ''];
    }

    private function restoreDrill(): array
    {
        $last = json_decode((string) SiteSetting::get(self::DRILL_SETTING, ''), true);
        if (!is_array($last)) {
            return [self::SKIP, 'No restore drill has run yet. It runs on the 1st of each month.', 'php artisan backup:restore-drill runs one now.'];
        }
        $when = isset($last['at']) ? Carbon::parse($last['at'])->diffForHumans() : 'recently';

        return match ($last['status'] ?? '') {
            'pass' => [self::PASS, 'Last drill ' . $when . ': the backup restored and matched.', ''],
            'skipped' => [self::SKIP, 'Last drill ' . $when . ' was skipped: ' . ($last['detail'] ?? ''), 'Set BACKUP_DRILL_DATABASE to an empty database the site may fill and empty (docs/DEPLOY_COMMAND.md).'],
            default => [self::FAIL, 'Last drill ' . $when . ' failed: ' . ($last['detail'] ?? 'see the report'), 'Read the drill report; a backup that does not restore is not a backup.'],
        };
    }

    /**
     * TEST and production share one Redis server (CLAUDE.md). A site that is
     * not production must use its own databases and prefixes, or its queue
     * jobs can run against production.
     */
    private function redisSeparation(): array
    {
        if ($this->production()) {
            return [self::SKIP, 'Production keeps the defaults.', ''];
        }
        if (blank(config('database.redis.default.path')) && blank(env('REDIS_PATH'))) {
            return [self::SKIP, 'Not on the shared Redis socket.', ''];
        }
        $problems = [];
        if ((string) config('database.redis.default.database', '0') === '0') {
            $problems[] = 'REDIS_DB';
        }
        if ((string) config('database.redis.cache.database', '1') === '1') {
            $problems[] = 'REDIS_CACHE_DB';
        }
        $slug = Str::slug((string) config('app.name'));
        if ((string) config('database.redis.options.prefix', '') === $slug . '-database-') {
            $problems[] = 'REDIS_PREFIX';
        }
        if ((string) config('cache.prefix', '') === $slug . '-cache-') {
            $problems[] = 'CACHE_PREFIX';
        }
        if ($problems !== []) {
            return [self::FAIL, 'Still on the defaults: ' . implode(', ', $problems) . '. This site shares production\'s queue and cache.', 'Set REDIS_DB=2, REDIS_CACHE_DB=3, REDIS_PREFIX=bg-test-database-, CACHE_PREFIX=bg-test-cache- (CLAUDE.md).'];
        }

        return [self::PASS, 'Own Redis databases and prefixes.', ''];
    }

    private function lastRun(string $command): ?Carbon
    {
        $at = $this->runs->getLastRuns([$command])[$command] ?? null;

        return is_string($at) && $at !== '' ? Carbon::parse($at) : null;
    }
}
