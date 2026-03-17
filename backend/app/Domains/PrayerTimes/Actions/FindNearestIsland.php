<?php

namespace App\Domains\PrayerTimes\Actions;

use App\Domains\PrayerTimes\DTOs\IslandData;
use App\Domains\PrayerTimes\Services\NearestIslandFinder;

final class FindNearestIsland
{
    public function __construct(
        private readonly NearestIslandFinder $finder,
    ) {}

    public function execute(float $lat, float $lng): ?IslandData
    {
        return $this->finder->find($lat, $lng);
    }
}
