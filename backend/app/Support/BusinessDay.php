<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\Carbon;
use Carbon\CarbonInterface;

/**
 * Venue calendar day helpers (Maldives, UTC+5).
 *
 * Order numbers, POS "Today", and reports must share the same day boundary.
 * Do not use raw UTC midnight when the cafe is in Indian/Maldives.
 */
final class BusinessDay
{
    public const TIMEZONE = 'Indian/Maldives';

    public static function timezone(): string
    {
        return self::TIMEZONE;
    }

    public static function now(): CarbonInterface
    {
        return Carbon::now(self::TIMEZONE);
    }

    public static function todayYmd(): string
    {
        return self::now()->toDateString();
    }

    /**
     * Inclusive start/end for a YYYY-MM-DD business day, expressed in the
     * app timezone so whereBetween matches how Laravel stores created_at.
     *
     * @return array{0: CarbonInterface, 1: CarbonInterface}
     */
    public static function bounds(string $ymd): array
    {
        $start = Carbon::parse($ymd, self::TIMEZONE)->startOfDay();
        $end = Carbon::parse($ymd, self::TIMEZONE)->endOfDay();
        $appTz = (string) config('app.timezone', 'UTC');

        return [
            $start->copy()->timezone($appTz),
            $end->copy()->timezone($appTz),
        ];
    }
}
