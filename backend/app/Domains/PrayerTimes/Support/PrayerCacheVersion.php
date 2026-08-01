<?php

declare(strict_types=1);

namespace App\Domains\PrayerTimes\Support;

use App\Support\ResilientCache;
use Illuminate\Support\Facades\Cache;

/**
 * Version prefix for prayer caches — bumping invalidates all island/time entries
 * without flushing unrelated application cache keys.
 */
final class PrayerCacheVersion
{
    private const VERSION_KEY = 'prayer_cache_version';

    public static function current(): int
    {
        return (int) ResilientCache::get(self::VERSION_KEY, 1);
    }

    public static function bump(): int
    {
        $next = self::current() + 1;
        ResilientCache::forever(self::VERSION_KEY, $next);

        return $next;
    }
}
