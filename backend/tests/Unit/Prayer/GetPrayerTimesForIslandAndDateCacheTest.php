<?php

declare(strict_types=1);

namespace Tests\Unit\Prayer;

use App\Domains\PrayerTimes\Actions\GetPrayerTimesForIslandAndDate;
use App\Domains\PrayerTimes\DTOs\IslandData;
use App\Domains\PrayerTimes\Services\PrayerTimeResolver;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GetPrayerTimesForIslandAndDateCacheTest extends TestCase
{
    use RefreshDatabase;

    public function test_null_lookup_is_not_cached(): void
    {
        Cache::flush();

        $island = new IslandData(
            id: 1,
            categoryId: 99,
            atoll: 'ކ',
            atollLatin: 'Kaafu',
            name: 'Test',
            nameLatin: 'Test',
            offsetMinutes: 0,
            latitude: 4.0,
            longitude: 73.0,
            isActive: true,
        );

        $action = new GetPrayerTimesForIslandAndDate(new PrayerTimeResolver);
        $date = Carbon::parse('2026-01-01');

        $this->assertNull($action->execute($island, $date));
        $this->assertFalse(Cache::has("prayer_times.1.2026-01-01"));

        DB::table('prayer_categories')->insert(['id' => 99]);
        DB::table('prayer_times')->insert([
            'category_id' => 99,
            'day_of_year' => 1,
            'fajr' => 300,
            'sunrise' => 360,
            'dhuhr' => 720,
            'asr' => 900,
            'maghrib' => 1080,
            'isha' => 1140,
        ]);

        $result = $action->execute($island, $date);
        $this->assertNotNull($result);
        $this->assertSame('05:00', $result->fajr);
    }
}
