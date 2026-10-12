<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use App\Support\ScheduleLock;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Tests\TestCase;

/**
 * A scheduled task's "without overlapping" lock must not outlive a killed run
 * by a day (2026-10-12: the scheduler's heartbeat sat behind one after a
 * deploy and the admin said "Scheduler stopped" while cron was fine).
 */
final class ScheduleLockTest extends TestCase
{
    public function test_a_lock_expires_by_how_often_the_task_runs(): void
    {
        self::assertSame(5, ScheduleLock::minutesFor('* * * * *'));
        self::assertSame(15, ScheduleLock::minutesFor('*/3 * * * *'));
        self::assertSame(15, ScheduleLock::minutesFor('*/5 * * * *'));
        self::assertSame(30, ScheduleLock::minutesFor('*/15 * * * *'));
        self::assertSame(30, ScheduleLock::minutesFor('0,30 * * * *'));
        self::assertSame(30, ScheduleLock::minutesFor('*/10 9 * * *'));
        self::assertSame(55, ScheduleLock::minutesFor('20 * * * *'));
        self::assertSame(55, ScheduleLock::minutesFor('0 */2 * * *'));
        self::assertSame(180, ScheduleLock::minutesFor('30 2 * * *'));
        self::assertSame(180, ScheduleLock::minutesFor('5 9 * * 1'));
        self::assertSame(180, ScheduleLock::minutesFor('0 10 1 * *'));
    }

    public function test_no_scheduled_task_keeps_the_framework_day_long_lock(): void
    {
        $events = app(Schedule::class)->events();
        self::assertNotEmpty($events);

        $locked = 0;
        foreach ($events as $event) {
            if (!$event->withoutOverlapping) {
                continue;
            }
            $locked++;
            self::assertSame(
                ScheduleLock::minutesFor($event->expression),
                (int) $event->expiresAt,
                $this->nameOf($event) . ' keeps a lock longer than its cadence calls for',
            );
            self::assertLessThanOrEqual(ScheduleLock::DAILY_OR_RARER, (int) $event->expiresAt, $this->nameOf($event));
        }

        self::assertGreaterThan(20, $locked, 'most tasks run without overlapping; the loop above saw too few');
    }

    public function test_the_heartbeats_take_no_lock(): void
    {
        $seen = [];
        foreach (app(Schedule::class)->events() as $event) {
            $name = $this->nameOf($event);
            foreach (['scheduler:heartbeat', 'QueueWorkerHeartbeatJob'] as $heartbeat) {
                if (str_contains($name, $heartbeat)) {
                    $seen[] = $heartbeat;
                    self::assertFalse($event->withoutOverlapping, $name . ' must not sit behind a lock a killed run can leave');
                }
            }
        }

        self::assertEqualsCanonicalizing(['scheduler:heartbeat', 'QueueWorkerHeartbeatJob'], $seen);
    }

    public function test_a_lock_a_killed_run_left_behind_frees_itself_within_the_tasks_window(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->first(fn (Event $e) => $e->withoutOverlapping && str_contains($this->nameOf($e), 'sms:dispatch-scheduled'));
        self::assertNotNull($event);
        self::assertSame(ScheduleLock::EVERY_MINUTE, (int) $event->expiresAt);

        // The lock a run takes, and never releases when the run is killed.
        self::assertTrue($event->mutex->create($event));
        self::assertTrue($event->mutex->exists($event), 'the next tick finds the lock and skips the task');

        $this->travel(ScheduleLock::EVERY_MINUTE - 1)->minutes();
        self::assertTrue($event->mutex->exists($event), 'still held within the window');

        $this->travel(2)->minutes();
        self::assertFalse($event->mutex->exists($event), 'gone once the window has passed: the task runs again');
    }

    private function nameOf(Event $event): string
    {
        return (string) ($event->command ?? $event->description ?? '');
    }
}
