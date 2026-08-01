<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Cache facade that never propagates store failures.
 *
 * On a dead Redis socket (or any store Throwable), remember*/put/forget
 * degrade: reads execute the callback directly, writes are no-ops after a
 * single per-request warning log.
 */
final class ResilientCache
{
    private const REQUEST_LOG_KEY = 'resilient_cache.logged';

    /**
     * @template T
     *
     * @param  callable(): T  $callback
     * @return T
     */
    public static function remember(string $key, mixed $ttl, callable $callback): mixed
    {
        try {
            return Cache::remember($key, $ttl, $callback);
        } catch (Throwable $e) {
            self::logOnce($e, 'remember', $key);

            return $callback();
        }
    }

    /**
     * @template T
     *
     * @param  callable(): T  $callback
     * @return T
     */
    public static function rememberForever(string $key, callable $callback): mixed
    {
        try {
            return Cache::rememberForever($key, $callback);
        } catch (Throwable $e) {
            self::logOnce($e, 'rememberForever', $key);

            return $callback();
        }
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        try {
            return Cache::get($key, $default);
        } catch (Throwable $e) {
            self::logOnce($e, 'get', $key);

            return value($default);
        }
    }

    public static function put(string $key, mixed $value, mixed $ttl = null): bool
    {
        try {
            return $ttl === null
                ? Cache::put($key, $value)
                : Cache::put($key, $value, $ttl);
        } catch (Throwable $e) {
            self::logOnce($e, 'put', $key);

            return false;
        }
    }

    public static function forever(string $key, mixed $value): bool
    {
        try {
            return Cache::forever($key, $value);
        } catch (Throwable $e) {
            self::logOnce($e, 'forever', $key);

            return false;
        }
    }

    public static function forget(string $key): bool
    {
        try {
            return Cache::forget($key);
        } catch (Throwable $e) {
            self::logOnce($e, 'forget', $key);

            return false;
        }
    }

    private static function logOnce(Throwable $e, string $op, string $key): void
    {
        try {
            if (app()->bound('request')) {
                $request = request();
                if ($request->attributes->get(self::REQUEST_LOG_KEY)) {
                    return;
                }
                $request->attributes->set(self::REQUEST_LOG_KEY, true);
            } elseif (app()->bound(self::REQUEST_LOG_KEY)) {
                return;
            } else {
                app()->instance(self::REQUEST_LOG_KEY, true);
            }
        } catch (Throwable) {
            // If the container/request is unavailable, still log once best-effort.
        }

        Log::warning('ResilientCache: cache store unavailable; degrading', [
            'op' => $op,
            'key' => $key,
            'error' => $e->getMessage(),
            'exception' => $e::class,
        ]);
    }
}
