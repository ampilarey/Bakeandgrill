<?php

declare(strict_types=1);

namespace App\Support;

use App\Domains\PrayerTimes\DTOs\IslandData;
use Carbon\Carbon;
use Illuminate\Support\Collection;

final class PrayerTimeHelper
{
    public const MVT_TIMEZONE = 'Indian/Maldives';

    /** Dhivehi name for Malé in salat.db */
    public const MALE_ISLAND_DV_NAME = 'މާލެ';

    /** IslandId for Malé in salat.db (not 1 — that is Thurakunu). */
    public const MALE_ISLAND_FALLBACK_ID = 102;

    /** Current instant in Maldives time (UTC+5, no DST). */
    public static function nowInMvt(): Carbon
    {
        return Carbon::now(self::MVT_TIMEZONE);
    }

    /** Start of today in Maldives time. */
    public static function todayInMvt(): Carbon
    {
        return self::nowInMvt()->startOfDay();
    }

    /** Whether a calendar date (Y-m-d) is today in Maldives. */
    public static function isSameMvtDay(Carbon $date): bool
    {
        return $date->format('Y-m-d') === self::todayInMvt()->format('Y-m-d');
    }

    public static function isMaleLatinName(?string $nameLatin): bool
    {
        if ($nameLatin === null || $nameLatin === '') {
            return false;
        }

        if (class_exists(\Normalizer::class)) {
            $normalized = \Normalizer::normalize($nameLatin, \Normalizer::FORM_D);
            if ($normalized !== false) {
                $nameLatin = preg_replace('/\p{M}/u', '', $normalized) ?? $nameLatin;
            }
        }

        $stripped = strtolower(preg_replace('/[^a-z]/i', '', $nameLatin) ?? '');

        return $stripped === 'male';
    }

    /**
     * @param  Collection<int, IslandData>  $islands
     */
    public static function findMaleIsland(Collection $islands): ?IslandData
    {
        $byDv = $islands->first(fn (IslandData $i) => $i->name === self::MALE_ISLAND_DV_NAME);
        if ($byDv !== null) {
            return $byDv;
        }

        return $islands->first(fn (IslandData $i) => self::isMaleLatinName($i->nameLatin));
    }
    /**
     * Convert an integer minutes-since-midnight value to HH:MM string.
     * Handles midnight rollover and negative offsets correctly.
     */
    public static function minutesToTime(int $minutes): string
    {
        $minutes = $minutes % 1440;
        if ($minutes < 0) {
            $minutes += 1440;
        }

        return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
    }

    /**
     * Parse a Carbon date to its 1-based day-of-year integer.
     * Uses Carbon's built-in dayOfYear which is leap-year aware.
     */
    public static function dayOfYear(Carbon $date): int
    {
        return (int) $date->dayOfYear;
    }

    /**
     * Safely parse a date string in Y-m-d format.
     * Returns null if the string is not a valid date.
     */
    public static function parseDate(string $dateStr): ?Carbon
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateStr)) {
            return null;
        }

        $date = Carbon::createFromFormat('Y-m-d', $dateStr, self::MVT_TIMEZONE);

        // createFromFormat returns false on parse failure in some PHP versions
        if ($date === false) {
            return null;
        }

        // Verify the parsed date string matches the input (catches overflows like 2026-13-01)
        if ($date->format('Y-m-d') !== $dateStr) {
            return null;
        }

        return $date;
    }
}
