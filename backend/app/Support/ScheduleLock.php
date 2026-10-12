<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Console\Scheduling\Schedule;

/**
 * How long a scheduled task's "without overlapping" lock may outlive the run
 * that took it.
 *
 * Laravel's default is 24 hours. A `schedule:run` that dies mid-task (a fatal
 * error, or the host reclaiming memory while the deploy's composer and
 * database backup run beside it) never releases the lock, and the task is then
 * skipped on every tick, silently, until the lock expires: a day without
 * scheduled texts, stale-order cancellation or the heartbeat the admin's red
 * banner watches. 2026-10-12: that banner said "Scheduler stopped" minutes
 * after a production deploy, for a scheduler that was running fine; its
 * heartbeat task sat behind such a lock. `php artisan schedule:clear-cache`
 * releases one by hand.
 *
 * A lock now expires a few ticks after an honest run would have finished,
 * matched to how often the task runs, so a stuck lock heals itself:
 *
 *   every minute            5 minutes
 *   every 2 to 5 minutes    15 minutes
 *   every 6 to 30 minutes   30 minutes
 *   hourly, under a day     55 minutes
 *   daily or rarer          3 hours
 *
 * Each is well past the longest honest run of the tasks on that cadence
 * (`sms:release-deferred`, every five minutes, sends at most 500 texts in a
 * run), and the next tick starting while a stuck lock is still held costs
 * that tick only. The two heartbeats take no lock at all: a lock that
 * outlives a killed run is exactly the failure a heartbeat exists to report.
 */
final class ScheduleLock
{
    /** The framework's own default, in minutes: what a bare withoutOverlapping() leaves. */
    public const FRAMEWORK_DEFAULT_MINUTES = 1440;

    public const EVERY_MINUTE = 5;

    public const UP_TO_EVERY_FIVE_MINUTES = 15;

    public const UP_TO_EVERY_HALF_HOUR = 30;

    public const UNDER_A_DAY = 55;

    public const DAILY_OR_RARER = 180;

    /** Minutes a lock may live for a task on this cron expression. */
    public static function minutesFor(string $expression): int
    {
        $every = self::cadenceMinutes($expression);

        return match (true) {
            $every <= 1 => self::EVERY_MINUTE,
            $every <= 5 => self::UP_TO_EVERY_FIVE_MINUTES,
            $every <= 30 => self::UP_TO_EVERY_HALF_HOUR,
            $every < 1440 => self::UNDER_A_DAY,
            default => self::DAILY_OR_RARER,
        };
    }

    /**
     * Give every task still on the framework's day-long lock the expiry its
     * cadence calls for. An expiry someone set by hand is kept.
     */
    public static function apply(Schedule $schedule): void
    {
        foreach ($schedule->events() as $event) {
            if ($event->withoutOverlapping && (int) $event->expiresAt === self::FRAMEWORK_DEFAULT_MINUTES) {
                $event->expiresAt = self::minutesFor($event->expression);
            }
        }
    }

    /**
     * Roughly how many minutes apart the expression fires: 1 for every minute,
     * N for "* /N", the gap of a list, 60 for one minute mark in every hour,
     * and 1440 for anything pinned to an hour of the day.
     */
    public static function cadenceMinutes(string $expression): int
    {
        [$minute, $hour] = array_pad(preg_split('/\s+/', trim($expression)) ?: [], 2, '*');

        $withinHour = self::stepOf((string) $minute, 60);
        if ($withinHour < 60) {
            return $withinHour;
        }

        $hours = self::stepOf((string) $hour, 24);

        return $hours < 24 ? $hours * 60 : 1440;
    }

    /**
     * How far apart a cron field's values sit, in that field's units: 1 for
     * "*" or a range, N for "* /N", the smallest gap of a list, and the whole
     * span when the field names one value.
     */
    private static function stepOf(string $field, int $span): int
    {
        if ($field === '*') {
            return 1;
        }
        if (preg_match('/^\*\/(\d+)$/', $field, $m) === 1) {
            return max(1, (int) $m[1]);
        }
        if (str_contains($field, '-') || str_contains($field, '/')) {
            return 1;
        }

        $values = array_values(array_unique(array_map('intval', explode(',', $field))));
        if (count($values) < 2) {
            return $span;
        }
        sort($values);

        $gaps = [];
        for ($i = 1, $n = count($values); $i < $n; $i++) {
            $gaps[] = $values[$i] - $values[$i - 1];
        }
        $gaps[] = $span - $values[count($values) - 1] + $values[0];

        return max(1, min($gaps));
    }
}
