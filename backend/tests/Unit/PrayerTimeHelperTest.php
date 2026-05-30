<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\PrayerTimeHelper;
use Carbon\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PrayerTimeHelperTest extends TestCase
{
    public function test_male_latin_name_detection(): void
    {
        $this->assertTrue(PrayerTimeHelper::isMaleLatinName('Malé'));
        $this->assertTrue(PrayerTimeHelper::isMaleLatinName('Male'));
        $this->assertFalse(PrayerTimeHelper::isMaleLatinName(null));
        $this->assertFalse(PrayerTimeHelper::isMaleLatinName('Hulhumalé'));
    }

    public function test_today_in_mvt_uses_maldives_timezone(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-22 20:00:00', 'UTC'));

        $today = PrayerTimeHelper::todayInMvt();

        // 20:00 UTC = 01:00 MVT next calendar day
        $this->assertSame('2026-05-23', $today->format('Y-m-d'));
        $this->assertSame(PrayerTimeHelper::MVT_TIMEZONE, $today->timezone->getName());

        Carbon::setTestNow();
    }

    public function test_is_same_mvt_day(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-01 22:30:00', 'UTC'));

        $mvtToday = PrayerTimeHelper::todayInMvt();
        $this->assertTrue(PrayerTimeHelper::isSameMvtDay($mvtToday));
        $this->assertFalse(PrayerTimeHelper::isSameMvtDay($mvtToday->copy()->subDay()));

        Carbon::setTestNow();
    }

    #[DataProvider('leapYearDayOfYearProvider')]
    public function test_day_of_year(int $year, string $date, int $expected): void
    {
        $this->assertSame(
            $expected,
            PrayerTimeHelper::dayOfYear(Carbon::parse($date, PrayerTimeHelper::MVT_TIMEZONE)),
        );
    }

    public static function leapYearDayOfYearProvider(): array
    {
        return [
            'feb 28 non-leap' => [2025, '2025-02-28', 59],
            'mar 1 non-leap' => [2025, '2025-03-01', 60],
            'feb 29 leap' => [2024, '2024-02-29', 60],
            'mar 1 leap' => [2024, '2024-03-01', 61],
        ];
    }
}
