<?php

namespace App\Support;

final class PrayerTimeHelper
{
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
    public static function dayOfYear(\Carbon\Carbon $date): int
    {
        return (int) $date->dayOfYear;
    }

    /**
     * Safely parse a date string in Y-m-d format.
     * Returns null if the string is not a valid date.
     */
    public static function parseDate(string $dateStr): ?\Carbon\Carbon
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateStr)) {
            return null;
        }

        $date = \Carbon\Carbon::createFromFormat('Y-m-d', $dateStr);

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
