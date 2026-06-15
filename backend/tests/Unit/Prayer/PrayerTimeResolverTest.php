<?php

declare(strict_types=1);

namespace Tests\Unit\Prayer;

use App\Domains\PrayerTimes\DTOs\IslandData;
use App\Domains\PrayerTimes\Services\PrayerTimeResolver;
use App\Support\PrayerTimeHelper;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PrayerTimeResolverTest extends TestCase
{
    use RefreshDatabase;

    private PrayerTimeResolver $resolver;

    private IslandData $island;

    protected function setUp(): void
    {
        parent::setUp();

        DB::table('prayer_categories')->insert(['id' => 1]);

        foreach ([59, 60, 61] as $day) {
            DB::table('prayer_times')->insert([
                'category_id' => 1,
                'day_of_year' => $day,
                'fajr' => 200 + $day,
                'sunrise' => 260 + $day,
                'dhuhr' => 720,
                'asr' => 900,
                'maghrib' => 1080,
                'isha' => 1140,
            ]);
        }

        $this->island = new IslandData(
            id: 1,
            categoryId: 1,
            atoll: 'ކ',
            atollLatin: 'Kaafu',
            name: 'Test',
            nameLatin: 'Test',
            offsetMinutes: 0,
            latitude: 4.0,
            longitude: 73.0,
            isActive: true,
        );

        $this->resolver = new PrayerTimeResolver;
    }

    public function test_non_leap_mar_1_uses_realigned_day_61_row(): void
    {
        $result = $this->resolver->resolve(
            $this->island,
            Carbon::parse('2025-03-01', PrayerTimeHelper::MVT_TIMEZONE),
        );

        $this->assertNotNull($result);
        $this->assertSame('04:21', $result->fajr);
    }

    public function test_leap_mar_1_uses_day_61_row_without_realignment(): void
    {
        $result = $this->resolver->resolve(
            $this->island,
            Carbon::parse('2024-03-01', PrayerTimeHelper::MVT_TIMEZONE),
        );

        $this->assertNotNull($result);
        $this->assertSame('04:21', $result->fajr);
    }

    public function test_non_leap_feb_28_uses_day_59_row(): void
    {
        $result = $this->resolver->resolve(
            $this->island,
            Carbon::parse('2025-02-28', PrayerTimeHelper::MVT_TIMEZONE),
        );

        $this->assertNotNull($result);
        $this->assertSame('04:19', $result->fajr);
    }

    public function test_leap_feb_29_uses_day_60_row(): void
    {
        $result = $this->resolver->resolve(
            $this->island,
            Carbon::parse('2024-02-29', PrayerTimeHelper::MVT_TIMEZONE),
        );

        $this->assertNotNull($result);
        $this->assertSame('04:20', $result->fajr);
    }
}
