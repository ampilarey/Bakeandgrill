<?php

declare(strict_types=1);

namespace App\Domains\Kitchen\Services;

use App\Models\ProductionCalendarPeriod;
use App\Services\OpeningHoursService;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * What kind of day a date is, as far as the production plan is concerned:
 * where it falls in the month, which holiday periods it sits in, and
 * whether the shop is shut.
 */
final class ProductionCalendar
{
    public function __construct(private readonly OpeningHoursService $hours) {}

    /** @return Collection<int, ProductionCalendarPeriod> */
    public function periodsBetween(string $from, string $to): Collection
    {
        return ProductionCalendarPeriod::query()
            ->overlapping($from, $to)
            ->orderBy('starts_on')
            ->orderBy('ends_on')
            ->get();
    }

    /** @return array<string, string> `['YYYY-MM-DD' => 'Reason']` */
    public function closures(): array
    {
        return $this->hours->closures();
    }

    /**
     * Describe one date against a set of periods and closures.
     *
     * When two periods of the same kind cover the day, the shorter one is
     * the more specific and lends its label and expectation.
     *
     * @param Collection<int, ProductionCalendarPeriod> $periods
     * @param array<string, string> $closures
     * @return array{kinds: list<string>, labels: array<string, string>, expectations: array<string, int>, closed: bool, closed_reason: string|null}
     */
    public function describe(string $date, Collection $periods, array $closures): array
    {
        $kinds = [];
        $labels = [];
        $expectations = [];
        $span = [];
        $closed = false;
        $reason = null;

        foreach ($periods as $period) {
            $starts = $period->starts_on->toDateString();
            $ends = $period->ends_on->toDateString();
            if ($date < $starts || $date > $ends) {
                continue;
            }
            $days = $period->starts_on->diffInDays($period->ends_on) + 1;

            if ($period->kind === 'closed') {
                $closed = true;
                $reason ??= $period->label ?: 'Closed';

                continue;
            }

            $kind = (string) $period->kind;
            if (isset($span[$kind]) && $span[$kind] <= $days) {
                continue;
            }
            $span[$kind] = $days;
            $kinds[$kind] = true;
            $labels[$kind] = $period->label ?: $period->kindLabel();
            if ($period->expected_change_pct !== null) {
                $expectations[$kind] = (int) $period->expected_change_pct;
            } else {
                unset($expectations[$kind]);
            }
        }

        if (isset($closures[$date])) {
            $closed = true;
            $reason ??= (string) $closures[$date];
        }

        $kindList = array_keys($kinds);
        sort($kindList);

        return [
            'kinds' => $kindList,
            'labels' => $labels,
            'expectations' => $expectations,
            'closed' => $closed,
            'closed_reason' => $reason,
        ];
    }

    /**
     * Start (1–10), middle (11–20) or end (21 onwards) of the month — the
     * owner's own observation that the pay cycle changes what sells.
     *
     * @return array{key: string, label: string}
     */
    public static function monthPosition(CarbonInterface $date): array
    {
        $day = $date->day;
        if ($day <= 10) {
            return ['key' => 'start', 'label' => 'Start of month (1–10)'];
        }
        if ($day <= 20) {
            return ['key' => 'mid', 'label' => 'Mid-month (11–20)'];
        }

        return ['key' => 'end', 'label' => 'End of month (21 onwards)'];
    }

    /** @return array<string, string> key → label, in order */
    public static function monthPositions(): array
    {
        return [
            'start' => 'Start of month (1–10)',
            'mid' => 'Mid-month (11–20)',
            'end' => 'End of month (21 onwards)',
        ];
    }
}
