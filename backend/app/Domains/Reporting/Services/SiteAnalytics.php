<?php

declare(strict_types=1);

namespace App\Domains\Reporting\Services;

use App\Domains\Reporting\Support\VisitPath;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The visitor report (owner, 2026-10-24: "Add maximum detail u can get"),
 * read from site_visit_events: how many came, how long they stayed, which
 * pages they saw, where they came in and left, where they came from, on what
 * device, from which country, at what hour, and how far they got towards an
 * order. A visitor is a person on a day (the hash changes daily), so a range
 * counts visitor-days; a session is one tab's visit.
 */
class SiteAnalytics
{
    /** The order app's steps towards an order, by the page reached. */
    public const FUNNEL = [
        ['key' => 'visit', 'label' => 'Visited', 'like' => null],
        // The website's menu or the order app's.
        ['key' => 'menu', 'label' => 'Looked at the menu', 'like' => ['/order/menu%', '/menu%', '/dv/menu%']],
        ['key' => 'order_app', 'label' => 'Opened the order app', 'like' => '/order%'],
        ['key' => 'checkout', 'label' => 'Reached checkout', 'like' => '/order/checkout%'],
        // The order page the app opens after Place order (a tracking link from a text is a later look, not a new order).
        ['key' => 'ordered', 'label' => 'Placed an order', 'like' => '/order/orders/:id%'],
    ];

    /** @return array<string, mixed> */
    public function report(string $from, string $to, string $surface = 'all'): array
    {
        $days = Carbon::parse($from)->diffInDays(Carbon::parse($to)) + 1;
        $prevTo = Carbon::parse($from)->subDay()->toDateString();
        $prevFrom = Carbon::parse($from)->subDays((int) $days)->toDateString();

        return [
            'range' => ['from' => $from, 'to' => $to, 'days' => (int) $days, 'surface' => $surface],
            'totals' => $this->totals($from, $to, $surface),
            'previous' => $this->totals($prevFrom, $prevTo, $surface),
            'live' => $this->live($surface),
            'daily' => $this->daily($from, $to, $surface),
            'hours' => $this->hours($from, $to, $surface),
            'pages' => $this->pages($from, $to, $surface),
            'entries' => $this->entries($from, $to, $surface),
            'exits' => $this->exits($from, $to, $surface),
            'sources' => $this->sources($from, $to, $surface),
            'campaigns' => $this->campaigns($from, $to, $surface),
            'devices' => $this->countBy('device', $from, $to, $surface),
            'browsers' => $this->countBy('browser', $from, $to, $surface),
            'systems' => $this->countBy('os', $from, $to, $surface),
            'countries' => $this->countBy('country', $from, $to, $surface),
            'languages' => $this->countBy('lang', $from, $to, $surface),
            'screens' => $this->screens($from, $to, $surface),
            'apps' => $this->countBy('surface', $from, $to, 'all'),
            'funnel' => $this->funnel($from, $to, $surface),
            'recent' => $this->recent($surface),
        ];
    }

    private function base(string $from, string $to, string $surface): Builder
    {
        $q = DB::table('site_visit_events')->whereBetween('day', [$from, $to]);
        if ($surface !== 'all') {
            $q->where('surface', $surface);
        }

        return $q;
    }

    /** @return array<string, int|float> */
    private function totals(string $from, string $to, string $surface): array
    {
        $views = (int) $this->base($from, $to, $surface)->count();
        $visitors = (int) $this->base($from, $to, $surface)->distinct()->count('visitor');
        $sessions = (int) $this->base($from, $to, $surface)->distinct()->count('session');
        $perSession = $this->base($from, $to, $surface)
            ->select('session', DB::raw('COUNT(*) as views'), DB::raw('COALESCE(SUM(duration_s), 0) as secs'))
            ->groupBy('session');
        $agg = DB::query()->fromSub($perSession, 's')
            ->selectRaw('COUNT(*) as n, SUM(CASE WHEN views = 1 THEN 1 ELSE 0 END) as bounces, AVG(secs) as avg_secs')
            ->first();
        $returning = (int) $this->base($from, $to, $surface)->where('returning', true)->distinct()->count('visitor');
        $timed = $this->base($from, $to, $surface)->whereNotNull('duration_s');

        return [
            'views' => $views,
            'visitors' => $visitors,
            'sessions' => $sessions,
            'pages_per_session' => $sessions > 0 ? round($views / $sessions, 2) : 0,
            'avg_session_s' => (int) round((float) ($agg->avg_secs ?? 0)),
            'avg_view_s' => (int) round((float) ((clone $timed)->avg('duration_s') ?? 0)),
            'bounce_rate' => ($agg->n ?? 0) > 0 ? round(100 * (int) $agg->bounces / (int) $agg->n, 1) : 0,
            'returning_rate' => $visitors > 0 ? round(100 * $returning / $visitors, 1) : 0,
        ];
    }

    /** @return array{visitors: int, views: int, pages: list<array{path: string, visitors: int}>} */
    private function live(string $surface): array
    {
        $q = DB::table('site_visit_events')->where('occurred_at', '>=', now()->subMinutes(5));
        if ($surface !== 'all') {
            $q->where('surface', $surface);
        }

        return [
            'visitors' => (int) (clone $q)->distinct()->count('session'),
            'views' => (int) (clone $q)->count(),
            'pages' => (clone $q)->select('path', DB::raw('COUNT(DISTINCT session) as visitors'))->groupBy('path')->orderByDesc('visitors')->limit(5)->get()
                ->map(fn ($r) => ['path' => $r->path, 'visitors' => (int) $r->visitors])->all(),
        ];
    }

    /** @return list<array{date: string, views: int, visitors: int, sessions: int}> */
    private function daily(string $from, string $to, string $surface): array
    {
        $rows = $this->base($from, $to, $surface)
            ->select('day', DB::raw('COUNT(*) as views'), DB::raw('COUNT(DISTINCT visitor) as visitors'), DB::raw('COUNT(DISTINCT session) as sessions'))
            ->groupBy('day')->get()->keyBy(fn ($r) => Carbon::parse($r->day)->toDateString());
        $out = [];
        for ($d = Carbon::parse($from); $d->lte(Carbon::parse($to)); $d->addDay()) {
            $r = $rows->get($d->toDateString());
            $out[] = ['date' => $d->toDateString(), 'views' => (int) ($r->views ?? 0), 'visitors' => (int) ($r->visitors ?? 0), 'sessions' => (int) ($r->sessions ?? 0)];
        }

        return $out;
    }

    /** Views by weekday (0 = Sunday) and hour, business time. @return list<list<int>> */
    private function hours(string $from, string $to, string $surface): array
    {
        $grid = array_fill(0, 7, array_fill(0, 24, 0));
        foreach ($this->base($from, $to, $surface)->select('dow', 'hour', DB::raw('COUNT(*) as n'))->groupBy('dow', 'hour')->get() as $r) {
            $grid[(int) $r->dow][(int) $r->hour] = (int) $r->n;
        }

        return $grid;
    }

    /** @return list<array{path: string, views: int, visitors: int, avg_s: int}> */
    private function pages(string $from, string $to, string $surface): array
    {
        return $this->base($from, $to, $surface)
            ->select('path', DB::raw('COUNT(*) as views'), DB::raw('COUNT(DISTINCT visitor) as visitors'), DB::raw('AVG(duration_s) as avg_s'))
            ->groupBy('path')->orderByDesc('views')->limit(30)->get()
            ->map(fn ($r) => ['path' => $r->path, 'views' => (int) $r->views, 'visitors' => (int) $r->visitors, 'avg_s' => (int) round((float) $r->avg_s)])->all();
    }

    /** Where sessions came in. @return list<array{path: string, sessions: int}> */
    private function entries(string $from, string $to, string $surface): array
    {
        return $this->base($from, $to, $surface)->where('is_entry', true)
            ->select('path', DB::raw('COUNT(*) as sessions'))->groupBy('path')->orderByDesc('sessions')->limit(15)->get()
            ->map(fn ($r) => ['path' => $r->path, 'sessions' => (int) $r->sessions])->all();
    }

    /** Where sessions ended: each session's last view. @return list<array{path: string, sessions: int}> */
    private function exits(string $from, string $to, string $surface): array
    {
        $last = $this->base($from, $to, $surface)->select(DB::raw('MAX(id) as id'))->groupBy('session');

        return DB::table('site_visit_events')->whereIn('id', $last)
            ->select('path', DB::raw('COUNT(*) as sessions'))->groupBy('path')->orderByDesc('sessions')->limit(15)->get()
            ->map(fn ($r) => ['path' => $r->path, 'sessions' => (int) $r->sessions])->all();
    }

    /** Where sessions came from, by their first view's referrer, grouped by name. @return list<array{name: string, host: ?string, sessions: int}> */
    private function sources(string $from, string $to, string $surface): array
    {
        $rows = $this->base($from, $to, $surface)->where('is_entry', true)
            ->select('referrer_host', DB::raw('COUNT(*) as sessions'))->groupBy('referrer_host')->get();
        $named = [];
        foreach ($rows as $r) {
            $name = VisitPath::sourceName($r->referrer_host);
            $named[$name] ??= ['name' => $name, 'hosts' => [], 'sessions' => 0];
            $named[$name]['sessions'] += (int) $r->sessions;
            if ($r->referrer_host) {
                $named[$name]['hosts'][] = $r->referrer_host;
            }
        }
        usort($named, fn ($a, $b) => $b['sessions'] <=> $a['sessions']);

        return array_slice(array_values($named), 0, 20);
    }

    /** @return list<array{source: ?string, medium: ?string, campaign: ?string, sessions: int}> */
    private function campaigns(string $from, string $to, string $surface): array
    {
        return $this->base($from, $to, $surface)->where('is_entry', true)->whereNotNull('utm_source')
            ->select('utm_source', 'utm_medium', 'utm_campaign', DB::raw('COUNT(*) as sessions'))
            ->groupBy('utm_source', 'utm_medium', 'utm_campaign')->orderByDesc('sessions')->limit(20)->get()
            ->map(fn ($r) => ['source' => $r->utm_source, 'medium' => $r->utm_medium, 'campaign' => $r->utm_campaign, 'sessions' => (int) $r->sessions])->all();
    }

    /** Visitors by one column. @return list<array{name: ?string, visitors: int, views: int}> */
    private function countBy(string $column, string $from, string $to, string $surface): array
    {
        return $this->base($from, $to, $surface)
            ->select($column, DB::raw('COUNT(DISTINCT visitor) as visitors'), DB::raw('COUNT(*) as views'))
            ->groupBy($column)->orderByDesc('visitors')->limit(20)->get()
            ->map(fn ($r) => ['name' => $r->{$column}, 'visitors' => (int) $r->visitors, 'views' => (int) $r->views])->all();
    }

    /** Screen widths in the bands the layouts use. @return list<array{name: string, visitors: int}> */
    private function screens(string $from, string $to, string $surface): array
    {
        $bands = ['Phone (under 768 px)' => [0, 767], 'Tablet (768–1023 px)' => [768, 1023], 'Laptop (1024–1439 px)' => [1024, 1439], 'Large screen (1440 px and up)' => [1440, 99999]];
        $out = [];
        foreach ($bands as $name => [$lo, $hi]) {
            $out[] = ['name' => $name, 'visitors' => (int) $this->base($from, $to, $surface)->whereBetween('screen_w', [$lo, $hi])->distinct()->count('visitor')];
        }

        return $out;
    }

    /** Sessions at each step towards an order. @return list<array{key: string, label: string, sessions: int}> */
    private function funnel(string $from, string $to, string $surface): array
    {
        $out = [];
        foreach (self::FUNNEL as $step) {
            $q = $this->base($from, $to, $surface);
            $likes = $step['like'] === null ? [] : (array) $step['like'];
            if ($likes !== []) {
                $q->where(function (Builder $w) use ($likes): void {
                    foreach ($likes as $like) {
                        $w->orWhere('path', 'like', $like);
                    }
                });
            }
            $out[] = ['key' => $step['key'], 'label' => $step['label'], 'sessions' => (int) $q->distinct()->count('session')];
        }

        return $out;
    }

    /** The latest views, newest first: the live feed. @return list<array<string, mixed>> */
    private function recent(string $surface): array
    {
        $q = DB::table('site_visit_events')->orderByDesc('id')->limit(40);
        if ($surface !== 'all') {
            $q->where('surface', $surface);
        }

        return $q->get(['occurred_at', 'surface', 'session', 'path', 'referrer_host', 'device', 'browser', 'os', 'country', 'returning', 'is_entry', 'duration_s'])
            ->map(fn ($r) => [
                'at' => Carbon::parse($r->occurred_at)->toIso8601String(),
                'surface' => $r->surface,
                // A short tag so one visit's pages can be told apart in the feed; not the session itself.
                'visit' => substr(hash('crc32b', (string) $r->session), 0, 4),
                'path' => $r->path,
                'source' => $r->is_entry ? VisitPath::sourceName($r->referrer_host) : null,
                'device' => $r->device,
                'browser' => $r->browser,
                'os' => $r->os,
                'country' => $r->country,
                'returning' => (bool) $r->returning,
                'duration_s' => $r->duration_s !== null ? (int) $r->duration_s : null,
            ])->all();
    }
}
