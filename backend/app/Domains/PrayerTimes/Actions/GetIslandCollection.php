<?php

namespace App\Domains\PrayerTimes\Actions;

use App\Domains\PrayerTimes\DTOs\IslandData;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

final class GetIslandCollection
{
    private const CACHE_KEY = 'prayer_islands_all';
    private const CACHE_TTL = 3600; // 1 hour

    /**
     * Return all active islands ordered by atoll then name.
     *
     * @return Collection<IslandData>
     */
    public function execute(): Collection
    {
        return Cache::remember(self::CACHE_KEY, self::CACHE_TTL, function () {
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
        Cache::forget(self::CACHE_KEY);
    }
}
