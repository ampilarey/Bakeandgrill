<?php

namespace App\Domains\PrayerTimes\Services;

use App\Domains\PrayerTimes\DTOs\IslandData;
use Illuminate\Support\Facades\DB;

final class NearestIslandFinder
{
    /**
     * Find the nearest active island to the given coordinates.
     * Uses the Haversine formula via database-level calculation.
     * Returns null if no island has coordinate data.
     */
    public function find(float $lat, float $lng): ?IslandData
    {
        $row = DB::table('prayer_islands')
            ->where('is_active', true)
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->selectRaw(
                '*, (6371 * acos(
                    cos(radians(?)) * cos(radians(latitude))
                    * cos(radians(longitude) - radians(?))
                    + sin(radians(?)) * sin(radians(latitude))
                )) AS distance',
                [$lat, $lng, $lat]
            )
            ->orderBy('distance')
            ->first();

        if ($row === null) {
            return null;
        }

        return IslandData::fromStdClass($row);
    }
}
