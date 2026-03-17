<?php

namespace App\Domains\PrayerTimes\Services;

use App\Domains\PrayerTimes\DTOs\IslandData;
use App\Domains\PrayerTimes\DTOs\PrayerTimesResult;
use App\Support\PrayerTimeHelper;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

final class PrayerTimeResolver
{
    /**
     * Resolve prayer times for an island on a given date.
     * Returns null if no data exists for that day (gap in source data).
     */
    public function resolve(IslandData $island, Carbon $date): ?PrayerTimesResult
    {
        $dayOfYear = PrayerTimeHelper::dayOfYear($date);

        // The source data was generated for a leap year (366 rows, days 1–366).
        // In non-leap years Carbon's dayOfYear skips day 60 (Feb 29), so from
        // Mar 1 onward every lookup would land one row early. Add 1 to realign.
        if (!$date->isLeapYear() && $dayOfYear >= 60) {
            $dayOfYear++;
        }

        $row = DB::table('prayer_times')
            ->where('category_id', $island->categoryId)
            ->where('day_of_year', $dayOfYear)
            ->first();

        if ($row === null) {
            return null;
        }

        $offset = $island->offsetMinutes;

        return new PrayerTimesResult(
            island:  $island,
            date:    $date,
            fajr:    PrayerTimeHelper::minutesToTime($row->fajr    + $offset),
            sunrise: PrayerTimeHelper::minutesToTime($row->sunrise + $offset),
            dhuhr:   PrayerTimeHelper::minutesToTime($row->dhuhr   + $offset),
            asr:     PrayerTimeHelper::minutesToTime($row->asr     + $offset),
            maghrib: PrayerTimeHelper::minutesToTime($row->maghrib + $offset),
            isha:    PrayerTimeHelper::minutesToTime($row->isha    + $offset),
        );
    }
}
