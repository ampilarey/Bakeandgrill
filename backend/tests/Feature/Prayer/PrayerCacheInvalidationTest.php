<?php

declare(strict_types=1);

namespace Tests\Feature\Prayer;

use App\Domains\PrayerTimes\Actions\GetPrayerTimesForIslandAndDate;
use App\Domains\PrayerTimes\DTOs\IslandData;
use App\Domains\PrayerTimes\Services\PrayerTimeResolver;
use App\Support\PrayerTimeHelper;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PrayerCacheInvalidationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        DB::table('prayer_categories')->insert(['id' => 1]);
        DB::table('prayer_islands')->insert([
            'id' => 102,
            'category_id' => 1,
            'atoll' => 'ކ',
            'atoll_latin' => 'Kaafu',
            'name' => PrayerTimeHelper::MALE_ISLAND_DV_NAME,
            'name_latin' => 'Malé',
            'offset_minutes' => 0,
            'latitude' => 4.1754,
            'longitude' => 73.5093,
            'is_active' => true,
        ]);
        DB::table('prayer_times')->insert([
            'category_id' => 1,
            'day_of_year' => 167,
            'fajr' => 270,
            'sunrise' => 330,
            'dhuhr' => 720,
            'asr' => 930,
            'maghrib' => 1080,
            'isha' => 1170,
        ]);
    }

    public function test_clear_cache_bumps_version_and_refreshes_lookup(): void
    {
        $island = new IslandData(
            id: 102,
            categoryId: 1,
            atoll: 'ކ',
            atollLatin: 'Kaafu',
            name: PrayerTimeHelper::MALE_ISLAND_DV_NAME,
            nameLatin: 'Malé',
            offsetMinutes: 0,
            latitude: 4.1754,
            longitude: 73.5093,
            isActive: true,
        );
        $date = Carbon::parse('2026-06-15');
        $action = new GetPrayerTimesForIslandAndDate(new PrayerTimeResolver);

        $first = $action->execute($island, $date);
        $this->assertSame('04:30', $first?->fajr);

        DB::table('prayer_times')
            ->where('category_id', 1)
            ->where('day_of_year', 167)
            ->update(['fajr' => 300]);

        $cached = $action->execute($island, $date);
        $this->assertSame('04:30', $cached?->fajr);

        $this->artisan('prayer:clear-cache')->assertSuccessful();

        $refreshed = $action->execute($island, $date);
        $this->assertSame('05:00', $refreshed?->fajr);
    }
}
