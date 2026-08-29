<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

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

    /** GET /admin/site-stats — reports.view. */
    public function stats(SiteVisitCounter $visits): JsonResponse
    {
        $tz = config('app.timezone', 'Indian/Maldives');
        $monthStart = now($tz)->startOfMonth();
        $todayStart = now($tz)->startOfDay();

        $orders = Order::query()->where('status', '!=', 'cancelled');
        $paid = Order::query()->whereNotNull('paid_at');

        return response()->json([
            'orders' => [
                'total' => (clone $orders)->count(),
                'this_month' => (clone $orders)->where('created_at', '>=', $monthStart)->count(),
                'today' => (clone $orders)->where('created_at', '>=', $todayStart)->count(),
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
