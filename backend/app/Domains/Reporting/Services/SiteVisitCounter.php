<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Counts page views and daily unique visitors without cookies or stored
 * identifiers. A visitor's daily hash (ip + user agent + date, salted with
 * the app key) exists only as a cache key with a 2-day TTL — the database
 * keeps aggregates alone. Approximate by design: JS beacons filter most
 * bots naturally, an explicit UA check catches the polite ones, and that is
 * as far as "counting people" honestly goes.
 */
class SiteVisitCounter
{
    public const SURFACES = ['web', 'order'];

    public function record(string $surface, string $ip, string $userAgent): void
    {
        if (!in_array($surface, self::SURFACES, true) || $this->looksLikeBot($userAgent)) {
            return;
        }

        $tz = config('app.timezone', 'Indian/Maldives');
        $date = now($tz)->toDateString();

        $hash = hash_hmac('sha256', "{$ip}|{$userAgent}|{$date}|{$surface}", (string) config('app.key'));
        // Cache::add is atomic: true exactly once per visitor per day.
        $isNewVisitor = Cache::add("visit:{$hash}", 1, 172800);

        $this->bump($date, $surface, $isNewVisitor);
    }

    /** @return array{today: array<string, int>, last_7: array<string, int>, last_30: array<string, int>} */
    public function summary(): array
    {
        $tz = config('app.timezone', 'Indian/Maldives');
        $today = now($tz)->toDateString();

        $window = fn (string $from) => [
            'views' => (int) DB::table('site_visits_daily')->where('date', '>=', $from)->sum('views'),
            'uniques' => (int) DB::table('site_visits_daily')->where('date', '>=', $from)->sum('uniques'),
        ];

        return [
            'today' => $window($today),
            'last_7' => $window(now($tz)->subDays(6)->toDateString()),
            'last_30' => $window(now($tz)->subDays(29)->toDateString()),
        ];
    }

    private function bump(string $date, string $surface, bool $isNewVisitor): void
    {
        $updated = DB::table('site_visits_daily')
            ->where('date', $date)
            ->where('surface', $surface)
            ->update([
                'views' => DB::raw('views + 1'),
                'uniques' => DB::raw('uniques + ' . ($isNewVisitor ? '1' : '0')),
                'updated_at' => now(),
            ]);
        if ($updated > 0) {
            return;
        }

        try {
            DB::table('site_visits_daily')->insert([
                'date' => $date,
                'surface' => $surface,
                'views' => 1,
                'uniques' => $isNewVisitor ? 1 : 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (\Illuminate\Database\QueryException) {
            // Lost the insert race to a concurrent beacon — retry as update.
            DB::table('site_visits_daily')
                ->where('date', $date)
                ->where('surface', $surface)
                ->update([
                    'views' => DB::raw('views + 1'),
                    'uniques' => DB::raw('uniques + ' . ($isNewVisitor ? '1' : '0')),
                    'updated_at' => now(),
                ]);
        }
    }

    private function looksLikeBot(string $userAgent): bool
    {
        $ua = strtolower($userAgent);

        return $ua === ''
            || str_contains($ua, 'bot')
            || str_contains($ua, 'crawler')
            || str_contains($ua, 'spider')
            || str_contains($ua, 'preview')
            || str_contains($ua, 'curl')
            || str_contains($ua, 'wget');
    }
}
