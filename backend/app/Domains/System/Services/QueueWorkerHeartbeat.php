<?php

declare(strict_types=1);

namespace App\Domains\System\Services;

use App\Support\ResilientCache;
use Carbon\CarbonInterface;

/**
 * Lightweight liveness signal for the Redis queue worker.
 *
 * Updated whenever a queued job finishes (success or failure). A scheduled
 * heartbeat job keeps the stamp fresh even when the queue is otherwise idle.
 */
class QueueWorkerHeartbeat
{
    public const CACHE_KEY = 'queue:worker:last_processed_at';

    /** Seconds without a processed job before the worker is considered dead. */
    public const STALE_AFTER_SECONDS = 300;

    public function record(?CarbonInterface $at = null): void
    {
        ResilientCache::forever(self::CACHE_KEY, ($at ?? now())->toIso8601String());
    }

    public function lastProcessedAt(): ?string
    {
        $value = ResilientCache::get(self::CACHE_KEY);

        return is_string($value) && $value !== '' ? $value : null;
    }
}
