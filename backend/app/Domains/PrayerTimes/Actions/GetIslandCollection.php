<?php

declare(strict_types=1);

namespace App\Domains\PrayerTimes\Actions;

use App\Domains\PrayerTimes\DTOs\IslandData;
use App\Domains\PrayerTimes\Support\PrayerCacheVersion;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

final class GetIslandCollection
{
    private const CACHE_TTL = 3600; // 1 hour

    /**
     * Return all active islands ordered by atoll then name.
     *
     * @return Collection<IslandData>
     */
    public function execute(): Collection
    {
        return Cache::remember(self::cacheKey(), self::CACHE_TTL, function () {
            return DB::table('prayer_islands')
                ->where('is_active', true)
                ->orderBy('atoll')
                ->orderBy('name')
                ->get([
                    'id', 'category_id', 'atoll', 'atoll_latin',
                    'name', 'name_latin', 'latitude', 'longitude',
                    'offset_minutes', 'is_active',
                ])
                ->map(fn ($row) => IslandData::fromStdClass($row));
        });
    }

    public static function forgetCache(): void
    {
        PrayerCacheVersion::bump();
    }

    private static function cacheKey(): string
    {
        return 'prayer_cache.' . PrayerCacheVersion::current() . '.islands_all';
    }

    public function findById(int $id): ?IslandData
    {
        $row = DB::table('prayer_islands')
            ->where('is_active', true)
            ->where('id', $id)
            ->first([
                'id', 'category_id', 'atoll', 'atoll_latin',
                'name', 'name_latin', 'latitude', 'longitude',
                'offset_minutes', 'is_active',
            ]);

        return $row !== null ? IslandData::fromStdClass($row) : null;
    }
}
