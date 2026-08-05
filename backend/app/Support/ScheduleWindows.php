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
        $tz = config('app.timezone', 'UTC');
        $now = $at->clone()->setTimezone($tz);
        $windows = $schedule[strtolower($now->format('D'))] ?? null;
        if (!$windows) {
            return false; // day not listed = closed
        }

        foreach ($windows as $window) {
            try {
                $open = Carbon::createFromFormat('H:i', $window['open'], $tz)->setDateFrom($now);
                $close = Carbon::createFromFormat('H:i', $window['close'], $tz)->setDateFrom($now);
            } catch (\Throwable) {
                continue;
            }

            if ($now->between($open, $close)) {
                return true;
            }
        }

        return false;
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
            if ($close->gt($open)) {
                $result[] = [$open, $close];
            }
        }

        return $result;
    }
}
