<?php

declare(strict_types=1);

namespace App\Domains\PrayerTimes\Actions;

use App\Domains\PrayerTimes\DTOs\IslandData;
use App\Domains\PrayerTimes\DTOs\PrayerTimesResult;
use App\Domains\PrayerTimes\Services\PrayerTimeResolver;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;

final class GetPrayerTimesForIslandAndDate
{
    private const CACHE_TTL = 86400; // 24 hours — prayer data is static per year

    private const CACHE_MISS = '__prayer_times_cache_miss__';

    public function __construct(
        private readonly PrayerTimeResolver $resolver,
    ) {}

    public function execute(IslandData $island, Carbon $date): ?PrayerTimesResult
    {
        $key = "prayer_times.{$island->id}.{$date->format('Y-m-d')}";

        $cached = Cache::get($key, self::CACHE_MISS);
        if ($cached !== self::CACHE_MISS) {
            return $cached;
        }

        $result = $this->resolver->resolve($island, $date);

        // Only cache successful lookups — null means no data row exists yet,
        // and caching it would block a subsequent import from being visible.
        if ($result !== null) {
            Cache::put($key, $result, self::CACHE_TTL);
        }

        return $result;
    }

    public static function forgetCache(int $islandId, Carbon $date): void
    {
        Cache::forget("prayer_times.{$islandId}.{$date->format('Y-m-d')}");
    }
}
