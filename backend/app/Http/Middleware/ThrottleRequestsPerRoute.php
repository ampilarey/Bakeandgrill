<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Illuminate\Routing\Middleware\ThrottleRequests;

/**
 * `throttle:N,M` with a count per route (UI audit, 2026-10-10).
 *
 * The framework keys a numbered throttle on the address (or the signed-in
 * user) alone, so every `throttle:60,1` and `throttle:120,1` in the app drew
 * from one shared count. Opening the order app's home page makes about 26
 * public requests, so half a minute of tapping around had the home page's
 * hours, prayer times and reviews refused, and ten quick reloads emptied the
 * menu ("Couldn't load the menu"). People on one Wi-Fi or mobile network
 * share an address, so it came sooner for them.
 *
 * Each route now keeps its own count: `/api/items` still allows 120 a minute
 * per address, but prayer times can no longer use that up. The route pattern
 * is the key, so /api/items/1 and /api/items/2 count together. Named
 * limiters (`throttle:customer-auth` and kin) key themselves and are
 * unchanged.
 */
class ThrottleRequestsPerRoute extends ThrottleRequests
{
    protected function resolveRequestSignature($request)
    {
        $signature = parent::resolveRequestSignature($request);
        $route = $request->route();
        $scope = $route ? implode(',', $route->methods()).' '.$route->uri() : '';
        $key = $scope.'|'.$signature;

        return self::$shouldHashKeys ? sha1($key) : $key;
    }
}
