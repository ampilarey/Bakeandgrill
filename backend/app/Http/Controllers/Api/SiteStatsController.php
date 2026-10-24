<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Reporting\Services\PublicSiteStats;
use App\Domains\Reporting\Services\SiteVisitCounter;
use App\Models\Customer;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;

/**
 * The "big numbers": lifetime orders / customers / revenue plus the
 * self-hosted visit counts. Revenue is the GST-inclusive paid total
 * (sum of total_laar on paid orders) — labelled as such in the UI.
 */
class SiteStatsController extends Controller
{
    /** POST /visits/beacon — public, throttled; fired by a JS beacon. */
    public function beacon(Request $request, SiteVisitCounter $visits): JsonResponse
    {
        $data = $request->validate([
            'surface' => ['required', Rule::in(SiteVisitCounter::SURFACES)],
            // The detail (2026-10-24): every key optional, so an older page's bare beacon still counts.
            'type' => ['nullable', Rule::in(['view', 'leave'])],
            'path' => ['nullable', 'string', 'max:2000'],
            'ref' => ['nullable', 'string', 'max:2000'],
            'sid' => ['nullable', 'string', 'max:40'],
            'pv' => ['nullable', 'string', 'max:40'],
            'screen' => ['nullable', 'integer', 'min:0', 'max:20000'],
            'lang' => ['nullable', 'string', 'max:20'],
            'returning' => ['nullable', 'boolean'],
            'utm_source' => ['nullable', 'string', 'max:200'],
            'utm_medium' => ['nullable', 'string', 'max:200'],
            'utm_campaign' => ['nullable', 'string', 'max:200'],
            's' => ['nullable', 'string', 'max:20'],
            'dur' => ['nullable', 'integer', 'min:0', 'max:86400'],
        ]);

        if (($data['type'] ?? 'view') === 'leave') {
            $visits->leave((string) ($data['pv'] ?? ''), (string) ($data['sid'] ?? ''), (int) ($data['dur'] ?? 0));

            return response()->json(['ok' => true]);
        }

        $visits->record(
            $data['surface'],
            (string) $request->ip(),
            (string) $request->userAgent(),
            array_intersect_key($data, array_flip(['path', 'ref', 'sid', 'pv', 'screen', 'lang', 'returning', 'utm_source', 'utm_medium', 'utm_campaign', 's'])),
            // Cloudflare names the visitor's country; without it the country is unknown.
            $request->header('CF-IPCountry'),
            $request->getHost(),
        );

        return response()->json(['ok' => true]);
    }

    /** GET /admin/site-analytics — reports.view. The visitor report: ?days=1|7|30|90|180 or from/to, surface=all|web|order. */
    public function analytics(Request $request, \App\Domains\Reporting\Services\SiteAnalytics $analytics): JsonResponse
    {
        $data = $request->validate([
            'days' => ['nullable', 'integer', 'min:1', 'max:180'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'surface' => ['nullable', Rule::in(['all', ...SiteVisitCounter::SURFACES])],
        ]);
        $tz = config('app.timezone', 'Indian/Maldives');
        $to = isset($data['to']) ? \Illuminate\Support\Carbon::parse($data['to'], $tz) : now($tz);
        $from = isset($data['from']) ? \Illuminate\Support\Carbon::parse($data['from'], $tz) : $to->copy()->subDays(((int) ($data['days'] ?? 7)) - 1);

        return response()->json($analytics->report($from->toDateString(), $to->toDateString(), $data['surface'] ?? 'all'));
    }

    /**
     * GET /public-stats?surface=web|order — public, cached, per surface.
     * Which counters (if any) each surface serves comes from that surface's
     * "Public counters" block in the Customer Surface Builder.
     */
    public function publicStats(Request $request, PublicSiteStats $public): JsonResponse
    {
        $surface = (string) $request->query('surface', 'web');

        return response()->json($public->payload(
            in_array($surface, PublicSiteStats::SURFACES, true) ? $surface : 'web',
        ));
    }

    /** GET /admin/site-stats — reports.view. */
    public function stats(SiteVisitCounter $visits): JsonResponse
    {
        $tz = config('app.timezone', 'Indian/Maldives');
        $monthStart = now($tz)->startOfMonth();
        $todayStart = now($tz)->startOfDay();

        $paid = Order::query()->whereNotNull('paid_at');

        return response()->json([
            // Combined across retail + wholesale + catering (OrderTallies is
            // the single definition, shared with the public counters).
            'orders' => [
                'total' => \App\Domains\Reporting\Support\OrderTallies::combined(),
                'this_month' => \App\Domains\Reporting\Support\OrderTallies::combined($monthStart),
                'today' => \App\Domains\Reporting\Support\OrderTallies::combined($todayStart),
                'breakdown' => [
                    'retail' => \App\Domains\Reporting\Support\OrderTallies::retail(),
                    'wholesale' => \App\Domains\Reporting\Support\OrderTallies::wholesale(),
                    'catering' => \App\Domains\Reporting\Support\OrderTallies::catering(),
                ],
            ],
            'customers' => [
                'total' => Customer::count(),
                'new_this_month' => Customer::where('created_at', '>=', $monthStart)->count(),
            ],
            'revenue' => [
                // MVR, GST-inclusive, paid orders only.
                'lifetime' => round(((int) (clone $paid)->sum('total_laar')) / 100, 2),
                'this_month' => round(((int) (clone $paid)->where('paid_at', '>=', $monthStart)->sum('total_laar')) / 100, 2),
            ],
            'visits' => $visits->summary(),
        ]);
    }
}
