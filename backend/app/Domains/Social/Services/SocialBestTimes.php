<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Models\SocialPostDelivery;

/**
 * When do posts do best? (Owner's shortlist, 2026-09-24.) From the stored
 * insights: each published delivery scores likes + 2×comments + 3×shares,
 * bucketed by the hour and weekday it went out (Maldives time). Nothing
 * is claimed under five scored posts — one lucky Friday is not a pattern.
 */
class SocialBestTimes
{
    public const MIN_SAMPLE = 5;

    /**
     * @return array{sample: int, enough: bool, top_hours: list<int>, hours: list<array{hour: int, avg: float, count: int}>, weekdays: list<array{day: int, avg: float, count: int}>}
     */
    public function compute(): array
    {
        $tz = config('app.timezone', 'Indian/Maldives');
        $byHour = [];
        $byDay = [];
        $sample = 0;

        $deliveries = SocialPostDelivery::query()
            ->where('status', SocialPostDelivery::STATUS_PUBLISHED)
            ->whereNotNull('insights')
            ->whereNotNull('published_at')
            ->get(['published_at', 'insights']);

        foreach ($deliveries as $d) {
            $i = $d->insights ?? [];
            $score = (int) ($i['likes'] ?? 0) + 2 * (int) ($i['comments'] ?? 0) + 3 * (int) ($i['shares'] ?? 0);
            $at = $d->published_at->copy()->setTimezone($tz);
            $byHour[$at->hour][] = $score;
            $byDay[$at->dayOfWeek][] = $score;
            $sample++;
        }

        $hours = [];
        foreach ($byHour as $hour => $scores) {
            $hours[] = ['hour' => (int) $hour, 'avg' => round(array_sum($scores) / count($scores), 1), 'count' => count($scores)];
        }
        usort($hours, fn ($a, $b) => $b['avg'] <=> $a['avg'] ?: $a['hour'] <=> $b['hour']);

        $weekdays = [];
        foreach ($byDay as $day => $scores) {
            $weekdays[] = ['day' => (int) $day, 'avg' => round(array_sum($scores) / count($scores), 1), 'count' => count($scores)];
        }
        usort($weekdays, fn ($a, $b) => $b['avg'] <=> $a['avg'] ?: $a['day'] <=> $b['day']);

        $enough = $sample >= self::MIN_SAMPLE;

        return [
            'sample' => $sample,
            'enough' => $enough,
            'top_hours' => $enough ? array_map(fn ($h) => $h['hour'], array_slice($hours, 0, 2)) : [],
            'hours' => $hours,
            'weekdays' => $weekdays,
        ];
    }
}
