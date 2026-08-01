<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Queue / event dispatch that never fails the HTTP response when Redis is down.
 *
 * Prefer QUEUE_CONNECTION=database when Redis is flaky. When Redis stays the
 * queue driver, wrap any Job::dispatch() reachable from a request with this.
 * Domain events already routed through DeferAfterResponse are safe as-is.
 */
final class ResilientDispatch
{
    public static function job(object $job): bool
    {
        try {
            dispatch($job);

            return true;
        } catch (Throwable $e) {
            Log::error('ResilientDispatch: queue push failed', [
                'job' => $job::class,
                'error' => $e->getMessage(),
                'exception' => $e::class,
            ]);

            return false;
        }
    }

    /**
     * @param  class-string  $jobClass
     * @param  mixed  ...$args  forwarded to Job::dispatch(...$args)
     */
    public static function jobClass(string $jobClass, mixed ...$args): bool
    {
        try {
            $jobClass::dispatch(...$args);

            return true;
        } catch (Throwable $e) {
            Log::error('ResilientDispatch: queue push failed', [
                'job' => $jobClass,
                'error' => $e->getMessage(),
                'exception' => $e::class,
            ]);

            return false;
        }
    }
}
