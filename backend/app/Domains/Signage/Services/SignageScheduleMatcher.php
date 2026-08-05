<?php

namespace App\Domains\Signage\Services;

use Carbon\Carbon;

/**
 * Shared schedule matching for campaigns, banners, and emergencies.
 * Overnight windows (end < start) wrap past midnight and use the window's
 * *start* day when checking days-of-week (e.g. Fri 22:00–02:00 matches Sat 01:00
 * when Friday is listed).
 */
class SignageScheduleMatcher
{
    /**
     * @param  array<string, mixed>  $schedule  Keys: date_start?, date_end?, days?, windows?
     */
    public static function matches(array $schedule, Carbon $now): bool
    {
        $dateStart = isset($schedule['date_start']) ? (string) $schedule['date_start'] : null;
        $dateEnd = isset($schedule['date_end']) ? (string) $schedule['date_end'] : null;
        if ($dateStart !== null && $dateStart !== '' && $now->toDateString() < $dateStart) {
            return false;
        }
        if ($dateEnd !== null && $dateEnd !== '' && $now->toDateString() > $dateEnd) {
            return false;
        }

        $days = $schedule['days'] ?? null;
        $dayNums = (is_array($days) && $days !== [])
            ? array_map('intval', $days)
            : null;

        $windows = $schedule['windows'] ?? null;
        if (! is_array($windows) || $windows === []) {
            if ($dayNums !== null && ! in_array((int) $now->dayOfWeek, $dayNums, true)) {
                return false;
            }

            return true;
        }

        $hm = $now->format('H:i');
        $today = (int) $now->dayOfWeek;
        $yesterday = (int) $now->copy()->subDay()->dayOfWeek;

        foreach ($windows as $window) {
            if (! is_array($window)) {
                continue;
            }
            $start = isset($window['start']) ? (string) $window['start'] : '00:00';
            $end = isset($window['end']) ? (string) $window['end'] : '23:59';

            if ($end < $start) {
                // Overnight window, e.g. 22:00–02:00 — match against the start day.
                if ($hm >= $start) {
                    if ($dayNums === null || in_array($today, $dayNums, true)) {
                        return true;
                    }
                } elseif ($hm <= $end) {
                    if ($dayNums === null || in_array($yesterday, $dayNums, true)) {
                        return true;
                    }
                }
            } elseif ($hm >= $start && $hm <= $end) {
                if ($dayNums === null || in_array($today, $dayNums, true)) {
                    return true;
                }
            }
        }

        return false;
    }
}
