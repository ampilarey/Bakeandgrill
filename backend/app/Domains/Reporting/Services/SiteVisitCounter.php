<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use App\Domains\Reporting\Support\UserAgentInfo;
use App\Domains\Reporting\Support\VisitPath;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Counts page views and daily unique visitors without cookies or stored
 * identifiers. A visitor's daily hash (ip + user agent + date, salted with
 * the app key) exists only as a cache key with a 2-day TTL — the database
 * keeps aggregates alone. Approximate by design: JS beacons filter most
 * bots naturally, an explicit UA check catches the polite ones, and that is
 * as far as "counting people" honestly goes.
 *
 * Each view is also kept in detail (owner, 2026-10-24: "Add maximum detail
 * u can get") in site_visit_events: the page, referrer, campaign, device,
 * browser, system, country, language, screen and time on page, with a
 * visitor hash that changes daily and the tab's own session tag. No IP
 * address or user agent is stored. See SiteAnalytics for the report.
 */
class SiteVisitCounter
{
    public const SURFACES = ['web', 'order'];

    /**
     * @param array{path?: ?string, ref?: ?string, sid?: ?string, pv?: ?string, screen?: ?int, lang?: ?string, returning?: ?bool, utm_source?: ?string, utm_medium?: ?string, utm_campaign?: ?string, s?: ?string} $detail
     */
    public function record(string $surface, string $ip, string $userAgent, array $detail = [], ?string $country = null, ?string $ownHost = null): void
    {
        if (!in_array($surface, self::SURFACES, true) || $this->looksLikeBot($userAgent)) {
            return;
        }

        $tz = config('app.timezone', 'Indian/Maldives');
        $now = now($tz);
        $date = $now->toDateString();

        $hash = hash_hmac('sha256', "{$ip}|{$userAgent}|{$date}|{$surface}", (string) config('app.key'));
        // Cache::add is atomic: true exactly once per visitor per day.
        $isNewVisitor = Cache::add("visit:{$hash}", 1, 172800);

        $this->bump($date, $surface, $isNewVisitor);

        // The detail never stops the count: a beacon from an older page carries none, and a failure is swallowed.
        if (!isset($detail['path'])) {
            return;
        }
        try {
            $this->keepView($surface, $ip, $userAgent, $detail, $country, $ownHost, $now);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** The time spent on a view, sent as the visitor leaves it (or moves to the next page in the order app). */
    public function leave(string $viewKey, string $session, int $seconds): void
    {
        if (!self::validTag($viewKey) || !self::validTag($session)) {
            return;
        }
        // Capped at an hour: a tab left open overnight is not a visit of eight hours.
        DB::table('site_visit_events')
            ->where('view_key', $viewKey)
            ->where('session', $session)
            ->update(['duration_s' => max(0, min(3600, $seconds))]);
    }

    /** A tag the browser made: 8 to 32 letters, digits, - or _. */
    public static function validTag(?string $tag): bool
    {
        return is_string($tag) && preg_match('/^[A-Za-z0-9_-]{8,32}$/', $tag) === 1;
    }

    /** @param array<string, mixed> $detail */
    private function keepView(string $surface, string $ip, string $userAgent, array $detail, ?string $country, ?string $ownHost, \Illuminate\Support\Carbon $now): void
    {
        $date = $now->toDateString();
        // One hash per person per day across both apps, so "all" counts a visitor once.
        $visitor = substr(hash_hmac('sha256', "{$ip}|{$userAgent}|{$date}", (string) config('app.key')), 0, 16);
        $session = self::validTag($detail['sid'] ?? null) ? (string) $detail['sid'] : substr(hash('sha256', $visitor . '|' . $surface), 0, 16);
        $ua = UserAgentInfo::parse($userAgent);
        $country = is_string($country) && preg_match('/^[A-Z]{2}$/', strtoupper($country)) && !in_array(strtoupper($country), ['XX', 'T1'], true) ? strtoupper($country) : null;
        $lang = is_string($detail['lang'] ?? null) ? strtolower(substr(preg_replace('/[^A-Za-z-]/', '', (string) $detail['lang']) ?? '', 0, 8)) : null;
        $screen = isset($detail['screen']) && is_numeric($detail['screen']) ? max(0, min(9999, (int) $detail['screen'])) : null;
        $utm = fn (string $k, int $len) => is_string($detail[$k] ?? null) && trim((string) $detail[$k]) !== '' ? mb_substr(strtolower(trim((string) $detail[$k])), 0, $len) : null;
        $source = $utm('utm_source', 60);
        $medium = $utm('utm_medium', 60);
        $campaign = $utm('utm_campaign', 80);
        // A link from a Social Hub post carries ?s=<delivery id> (RecordSocialVisit): it is a campaign too.
        if ($source === null && is_string($detail['s'] ?? null) && ctype_digit((string) $detail['s'])) {
            [$source, $medium, $campaign] = ['social hub', 'social', 'post ' . $detail['s']];
        }

        DB::table('site_visit_events')->insert([
            'occurred_at' => now(),
            'day' => $date,
            'hour' => (int) $now->format('G'),
            'dow' => (int) $now->format('w'),
            'surface' => $surface,
            'visitor' => $visitor,
            'session' => $session,
            'view_key' => self::validTag($detail['pv'] ?? null) ? (string) $detail['pv'] : null,
            'path' => VisitPath::clean((string) $detail['path']),
            'referrer_host' => VisitPath::referrerHost(is_string($detail['ref'] ?? null) ? $detail['ref'] : null, $ownHost),
            'utm_source' => $source,
            'utm_medium' => $medium,
            'utm_campaign' => $campaign,
            'device' => $ua['device'],
            'browser' => $ua['browser'],
            'os' => $ua['os'],
            'country' => $country,
            'lang' => $lang !== '' ? $lang : null,
            'screen_w' => $screen,
            'returning' => (bool) ($detail['returning'] ?? false),
            // The first view of a session is where the visit came in.
            'is_entry' => Cache::add('visit-session:' . $session, 1, 7200),
        ]);
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
        return UserAgentInfo::looksLikeBot($userAgent);
    }
}
