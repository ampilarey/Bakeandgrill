<?php

declare(strict_types=1);

namespace App\Domains\System\Services;

/**
 * The worker's own pulse.
 *
 * `queue:work` fires Illuminate\Queue\Events\Looping on every pass of its loop,
 * busy or idle, so a stamp written from there says the process is up and can
 * reach the cache. Until 2026-10-21 the stamp came only from finished jobs and
 * the scheduled QueueWorkerHeartbeatJob, so a host that queues nothing for five
 * minutes read "degraded: queue" for a worker that was fine: TEST, which has no
 * scheduler to queue that job. The scheduled job stays, as the proof that a job
 * goes through end to end; this is the proof that the process is alive.
 *
 * One write a minute, not one every three seconds. Bound as a singleton so the
 * throttle lives for the worker process.
 */
class QueueLoopHeartbeat
{
    /** Seconds between two writes from the loop. */
    public const EVERY_SECONDS = 60;

    private ?int $lastBeatAt = null;

    public function __construct(private readonly QueueWorkerHeartbeat $heartbeat = new QueueWorkerHeartbeat) {}

    /**
     * Called from the Looping listener. Returns nothing on purpose: a listener
     * that returns false would pause the worker.
     */
    public function onLoop(): void
    {
        $now = now()->getTimestamp();
        if ($this->lastBeatAt !== null && $now - $this->lastBeatAt < self::EVERY_SECONDS) {
            return;
        }

        $this->lastBeatAt = $now;
        $this->heartbeat->record();
    }
}
