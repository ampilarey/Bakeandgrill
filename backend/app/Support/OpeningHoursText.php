<?php

declare(strict_types=1);

namespace App\Support;

use App\Services\OpeningHoursService;

/**
 * Opening hours as the customer reads them, one style everywhere
 * (UI audit, 2026-10-10).
 *
 * The Hours page and the footer printed "00:00 – 23:59", the Contact page a
 * fixed "7:00 AM – 11:00 PM" that came from no setting, the maintenance page
 * the raw stored JSON, and the order app "Hours not available". They all
 * read the schedule set in Admin now (OpeningHoursService) and print it the
 * same way: "7:00 AM – 11:00 PM".
 */
final class OpeningHoursText
{
    public const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    /** "07:00" or "19:30:00" as "7:00 AM" / "7:30 PM"; the input unchanged when it is not a time. */
    public static function time(string $hhmm): string
    {
        if (! preg_match('/^(\d{1,2}):(\d{2})/', trim($hhmm), $m) || (int) $m[1] > 23) {
            return $hhmm;
        }
        $h = (int) $m[1];

        return (($h % 12) ?: 12).':'.$m[2].' '.($h >= 12 ? 'PM' : 'AM');
    }

    /**
     * One day's row from OpeningHoursService as "7:00 AM – 11:00 PM", or
     * null for a closed day (or one missing from the schedule).
     *
     * @param  array<string, mixed>|null  $row
     */
    public static function range(?array $row): ?string
    {
        if (! is_array($row) || ! empty($row['closed'])) {
            return null;
        }
        $open = trim((string) ($row['open'] ?? ''));
        $close = trim((string) ($row['close'] ?? ''));
        if ($open === '' || $close === '') {
            return null;
        }

        return self::time($open).' – '.self::time($close);
    }

    /**
     * Runs of days with the same hours, Sunday first, for a short list:
     * [['days' => 'Sunday – Thursday', 'hours' => '7:00 AM – 11:00 PM'], …].
     * A closed run reads 'Closed'.
     *
     * @param  array<int, mixed>|null  $hours  Rows keyed 0 (Sunday) to 6; defaults to the live schedule.
     * @return list<array{days: string, hours: string}>
     */
    public static function groups(?array $hours = null): array
    {
        $hours ??= app(OpeningHoursService::class)->getHoursForDisplay();
        $runs = [];
        for ($d = 0; $d < 7; $d++) {
            $row = $hours[$d] ?? null;
            $label = self::range(is_array($row) ? $row : null) ?? 'Closed';
            $last = array_key_last($runs);
            if ($last !== null && $runs[$last]['hours'] === $label) {
                $runs[$last]['to'] = $d;
            } else {
                $runs[] = ['from' => $d, 'to' => $d, 'hours' => $label];
            }
        }

        return array_map(fn (array $run) => [
            'days' => $run['from'] === $run['to']
                ? self::DAY_NAMES[$run['from']]
                : self::DAY_NAMES[$run['from']].' – '.self::DAY_NAMES[$run['to']],
            'hours' => $run['hours'],
        ], $runs);
    }
}
