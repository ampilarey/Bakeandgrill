<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Support;

use App\Models\SiteSetting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * How long the visitor report's detail is kept (owner, 2026-10-24: keep it
 * all, and "when data is large add manual del or auto del settings in the
 * admin"). Kept for ever unless the owner picks a time in Admin → Website
 * visitors, which `visits:prune` then applies each night; they can also
 * delete everything before a date by hand. The daily totals in
 * site_visits_daily are never touched.
 */
final class VisitRetention
{
    public const KEY = 'visits_detail_keep_days';

    /** 0 = keep for ever. */
    public const CHOICES = [0, 90, 180, 365, 730];

    /** About what one stored view takes, row and indexes, for the size shown. */
    public const BYTES_PER_VIEW = 420;

    /** Past this the page suggests deleting or an automatic time. */
    public const LARGE_VIEWS = 2_000_000;

    public static function keepDays(): int
    {
        $days = (int) SiteSetting::get(self::KEY, 0);

        return in_array($days, self::CHOICES, true) ? $days : 0;
    }

    public static function setKeepDays(int $days): void
    {
        SiteSetting::set(self::KEY, (string) (in_array($days, self::CHOICES, true) ? $days : 0));
    }

    /** @return array{views: int, oldest: ?string, approx_mb: float, large: bool, keep_days: int, choices: list<int>} */
    public static function storage(): array
    {
        $views = (int) DB::table('site_visit_events')->count();
        $oldest = DB::table('site_visit_events')->min('day');

        return [
            'views' => $views,
            'oldest' => $oldest ? Carbon::parse($oldest)->toDateString() : null,
            'approx_mb' => round($views * self::BYTES_PER_VIEW / 1048576, 1),
            'large' => $views >= self::LARGE_VIEWS,
            'keep_days' => self::keepDays(),
            'choices' => self::CHOICES,
        ];
    }

    /** Deletes the detail of every day before $day, in batches so a big table never holds a long lock. */
    public static function deleteBefore(string $day): int
    {
        $deleted = 0;
        do {
            $ids = DB::table('site_visit_events')->where('day', '<', $day)->orderBy('id')->limit(5000)->pluck('id');
            $deleted += $ids->isEmpty() ? 0 : DB::table('site_visit_events')->whereIn('id', $ids)->delete();
        } while ($ids->count() === 5000);

        return $deleted;
    }
}
