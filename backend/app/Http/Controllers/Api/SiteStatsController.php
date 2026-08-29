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
        ]);

        $visits->record(
            $data['surface'],
            (string) $request->ip(),
            (string) $request->userAgent(),
        );

        return response()->json(['ok' => true]);
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
