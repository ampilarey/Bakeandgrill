<?php

namespace App\Domains\Signage\Services;

use Carbon\Carbon;

/**
 * Shared schedule matching for campaigns, banners, and emergencies.
 * Overnight windows (end < start) wrap past midnight.
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
        if (is_array($days) && $days !== []) {
            $dayNums = array_map('intval', $days);
            if (! in_array((int) $now->dayOfWeek, $dayNums, true)) {
                return false;
            }
        }

        $windows = $schedule['windows'] ?? null;
        if (! is_array($windows) || $windows === []) {
            return true;
        }

        $hm = $now->format('H:i');
        foreach ($windows as $window) {
            if (! is_array($window)) {
                continue;
            }
            $start = isset($window['start']) ? (string) $window['start'] : '00:00';
            $end = isset($window['end']) ? (string) $window['end'] : '23:59';
            if ($end < $start) {
                // Overnight window, e.g. 22:00–02:00
                if ($hm >= $start || $hm <= $end) {
                    return true;
                }
            } elseif ($hm >= $start && $hm <= $end) {
                return true;
            }
        }

        return false;
    }
}
