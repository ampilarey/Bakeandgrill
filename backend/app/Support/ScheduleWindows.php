<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\Carbon;

/**
 * Shared per-day schedule evaluation for feature gates.
 *
 * Same JSON formats as the online ordering gate:
 *   {"mon": {"open":"07:00","close":"22:00","enabled":true}, ...}
 *   {"mon": [{"open":"11:00","close":"15:00"}, ...], ...}
 *   {"mon": {"enabled":true,"windows":[{"open":...,"close":...}]}, ...}
 *
 * null / invalid / empty schedule = no schedule = always open.
 *
 * **Windows may cross midnight** — a café closing at 01:00 is ordinary here.
 * That took two fixes, and the first was not a near miss:
 *
 *   1. `within()` stamped both times onto today, so 17:00 → 01:00 produced
 *      `between(today 17:00, today 01:00)`. Carbon's between() silently swaps
 *      reversed bounds, which **inverted** the window: closed all evening,
 *      open all morning. Measured before the fix — open at 13:00, closed at
 *      23:00.
 *   2. Only today's row was consulted. At 00:30 on Tuesday a Monday
 *      17:00 → 01:00 window is still running, so an overnight window has to
 *      be looked for on the day it *opened*, not the day it ends.
 *
 * `windowsForDate()` had a third form of it: `if ($close->gt($open))` dropped
 * overnight windows outright, so PickupSlotService generated no pickup slots
 * at all on a late-closing day.
 *
 * Windows are half-open, `open <= now < close`, so two adjacent windows never
 * both claim the same instant.
 */
final class ScheduleWindows
{
    /**
     * @return array<string, list<array{open: string, close: string}>>|null
     */
    public static function parse(?string $raw): ?array
    {
        if (!$raw) {
            return null;
        }

        try {
            $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }

        if (!is_array($decoded) || empty($decoded)) {
            return null;
        }

        $normalised = [];
        foreach ($decoded as $day => $value) {
            if (!is_string($day) || !is_array($value)) {
                continue;
            }

            // New UI format: {"enabled": bool, "windows": [{"open":…,"close":…}, …]}
            if (isset($value['windows']) && is_array($value['windows'])) {
                if (isset($value['enabled']) && $value['enabled'] === false) {
                    continue;
                }
                $windows = [];
                foreach ($value['windows'] as $win) {
                    if (is_array($win) && !empty($win['open']) && !empty($win['close'])) {
                        $windows[] = ['open' => $win['open'], 'close' => $win['close']];
                    }
                }
                if (!empty($windows)) {
                    $normalised[$day] = $windows;
                }
                continue;
            }

            // Bare array of windows: [{"open":…,"close":…}, …]
            if (isset($value[0]) && is_array($value[0])) {
                $windows = [];
                foreach ($value as $win) {
                    if (!empty($win['open']) && !empty($win['close'])) {
                        $windows[] = ['open' => $win['open'], 'close' => $win['close']];
                    }
                }
                if (!empty($windows)) {
                    $normalised[$day] = $windows;
                }
                continue;
            }

            // Old single-window object: {"open":…,"close":…,"enabled":…}
            if (!empty($value['open']) && !empty($value['close'])) {
                if (isset($value['enabled']) && $value['enabled'] === false) {
                    continue;
                }
                $normalised[$day] = [['open' => $value['open'], 'close' => $value['close']]];
            }
        }

        return empty($normalised) ? null : $normalised;
    }

    /**
     * @param array<string, list<array{open: string, close: string}>> $schedule
     */
    public static function within(array $schedule, Carbon $at): bool
    {
        return self::activeClose($schedule, $at) !== null;
    }

    /**
     * The close time of whichever window is running at $at, or null.
     *
     * Looks at yesterday as well as today: an overnight window belongs to the
     * day it opened on.
     *
     * @param array<string, list<array{open: string, close: string}>> $schedule
     */
    public static function activeClose(array $schedule, Carbon $at): ?Carbon
    {
        $tz = config('app.timezone', 'UTC');
        $now = $at->clone()->setTimezone($tz);

        foreach ([-1, 0] as $dayOffset) {
            foreach (self::windowsForDate($schedule, $now->clone()->addDays($dayOffset)) as [$open, $close]) {
                if ($now->greaterThanOrEqualTo($open) && $now->lessThan($close)) {
                    return $close;
                }
            }
        }

        return null;
    }

    /**
     * The next opening after $at, looking a week ahead.
     *
     * Starts a day back so an overnight window that opened yesterday is
     * considered, and keeps the earliest match rather than the first listed —
     * a day's windows are not guaranteed to be in chronological order.
     *
     * @param array<string, list<array{open: string, close: string}>> $schedule
     */
    public static function nextOpen(array $schedule, Carbon $at): ?Carbon
    {
        $tz = config('app.timezone', 'UTC');
        $now = $at->clone()->setTimezone($tz);
        $best = null;

        for ($i = -1; $i <= 7; $i++) {
            foreach (self::windowsForDate($schedule, $now->clone()->addDays($i)) as [$open, $close]) {
                if ($open->lessThanOrEqualTo($now)) {
                    continue;
                }
                if ($best === null || $open->lessThan($best)) {
                    $best = $open;
                }
            }
            // No later day can beat an opening already found on an earlier one.
            if ($best !== null && $i >= 0) {
                break;
            }
        }

        return $best;
    }

    /**
     * Windows for a specific calendar day, as concrete Carbon pairs.
     *
     * @param array<string, list<array{open: string, close: string}>> $schedule
     * @return list<array{0: Carbon, 1: Carbon}>
     */
    public static function windowsForDate(array $schedule, Carbon $day): array
    {
        $tz = config('app.timezone', 'UTC');
        $local = $day->clone()->setTimezone($tz);
        $windows = $schedule[strtolower($local->format('D'))] ?? null;
        if (!$windows) {
            return [];
        }

        $result = [];
        foreach ($windows as $window) {
            try {
                $open = Carbon::createFromFormat('H:i', $window['open'], $tz)->setDateFrom($local);
                $close = Carbon::createFromFormat('H:i', $window['close'], $tz)->setDateFrom($local);
            } catch (\Throwable) {
                continue;
            }
            // 17:00 → 01:00 closes tomorrow. This used to be
            // `if ($close->gt($open))`, which discarded the window entirely
            // and left an overnight day with no pickup slots at all.
            if ($close->lessThanOrEqualTo($open)) {
                $close = $close->addDay();
            }
            $result[] = [$open, $close];
        }

        return $result;
    }
}
