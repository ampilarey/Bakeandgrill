<?php

declare(strict_types=1);

namespace Tests\Feature\System;

use App\Domains\System\Services\QueueLoopHeartbeat;
use App\Domains\System\Services\QueueWorkerHeartbeat;
use App\Domains\System\Services\SystemHealthService;
use App\Support\ResilientCache;
use Illuminate\Queue\Events\Looping;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/**
 * The worker's loop stamps the heartbeat on its own, so a host that queues
 * nothing (TEST has no scheduler) still reads alive while `queue:work` runs.
 */
class QueueLoopHeartbeatTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        ResilientCache::forget(QueueWorkerHeartbeat::CACHE_KEY);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function stampAt(): ?int
    {
        $stamp = (new QueueWorkerHeartbeat)->lastProcessedAt();

        return $stamp === null ? null : Carbon::parse($stamp)->getTimestamp();
    }

    public function test_a_pass_of_the_worker_loop_records_the_heartbeat(): void
    {
        Carbon::setTestNow('2026-10-21 13:40:00');
        $this->assertNull($this->stampAt());

        // The worker dispatches Looping with until(): a non-null answer pauses it.
        $this->assertNull(Event::until(new Looping('redis', 'default')));

        $this->assertSame(now()->getTimestamp(), $this->stampAt());
    }

    public function test_the_loop_writes_once_a_minute(): void
    {
        Carbon::setTestNow('2026-10-21 13:40:00');
        $first = now()->getTimestamp();
        Event::until(new Looping('redis', 'default'));
        $this->assertSame($first, $this->stampAt());

        Carbon::setTestNow('2026-10-21 13:40:30');
        Event::until(new Looping('redis', 'default'));
        $this->assertSame($first, $this->stampAt(), 'Thirty seconds on, the stamp is left alone');

        Carbon::setTestNow('2026-10-21 13:41:01');
        Event::until(new Looping('redis', 'default'));
        $this->assertSame(now()->getTimestamp(), $this->stampAt(), 'A minute on, it is written again');
    }

    public function test_the_throttle_is_one_per_process(): void
    {
        $this->assertSame(app(QueueLoopHeartbeat::class), app(QueueLoopHeartbeat::class));
    }

    public function test_an_idle_worker_reads_alive_to_the_health_check(): void
    {
        config(['queue.default' => 'redis']);
        Carbon::setTestNow('2026-10-21 13:40:00');

        $this->assertSame('no_heartbeat', app(SystemHealthService::class)->checkQueueWorker()['status']);

        Event::until(new Looping('redis', 'default'));

        $this->assertSame('alive', app(SystemHealthService::class)->checkQueueWorker()['status']);
        $this->assertNotContains('queue', app(SystemHealthService::class)->degradedDependencies());
    }
}
