<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\CustomerCreditLedger;
use App\Models\Order;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;

/**
 * The first day a report has anything to show (owner, 2026-11-08: "today, yesterday, … all").
 * A report's "All" chip asks from this day to today, and a range check measures from here, so
 * "All" is never refused for being longer than a year while nothing older exists.
 */
final class FirstDay
{
    /** Y-m-d of the first order, or today when there is none. */
    public static function orders(): string
    {
        return self::of('orders', Order::query());
    }

    /** Y-m-d of the first credit repayment, or today. */
    public static function creditRepayments(): string
    {
        return self::of('credit_repayments', CustomerCreditLedger::query()->where('type', 'payment'));
    }

    /**
     * Pulls `$from` up to the first day when the range would otherwise be longer than
     * `$maxDays`: nothing before that day exists, so the answer is the same.
     */
    public static function clamp(Carbon $from, CarbonInterface $to, int $maxDays, string $firstDay): Carbon
    {
        if ($from->diffInDays($to) <= $maxDays) {
            return $from;
        }
        $first = $from->copy()->setTimeFromTimeString('00:00')->setDateFrom(Carbon::parse($firstDay));

        return $first->greaterThan($from) && $first->lessThanOrEqualTo($to) ? $first : $from;
    }

    /**
     * Whether a range is longer than a report allows. A range from the first day on (All, or
     * anything reaching back before it) is everything there is and is always allowed.
     */
    public static function tooLong(CarbonInterface $from, CarbonInterface $to, int $maxDays, string $firstDay): bool
    {
        if ($from->diffInDays($to) <= $maxDays) {
            return false;
        }

        return $from->toDateString() > $firstDay;
    }

    private static function of(string $key, Builder $query): string
    {
        $today = now()->toDateString();

        return (string) Cache::remember('first_day.' . $key, 600, function () use ($query, $today): string {
            $min = $query->min('created_at');

            return $min ? Carbon::parse((string) $min)->toDateString() : $today;
        });
    }
}
