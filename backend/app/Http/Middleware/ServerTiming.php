<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Says on every answer how long the server took, and on what.
 *
 * Menu audit, 2026-11-15 (owner: "I think it takes some time to load"). From
 * outside, a slow page is one number; this splits it into the three that
 * matter, in the standard `Server-Timing` header that every browser's network
 * panel and `curl -I` show:
 *
 *   boot  the framework starting, before any of the page's own code
 *   db    time inside database queries, with how many there were
 *   app   everything else the request did (the page's code and its view)
 *
 * Only durations and a count: no query text, no paths, nothing about the
 * visitor. It never throws; a request must not fail over its own stopwatch.
 */
final class ServerTiming
{
    public function handle(Request $request, Closure $next): Response
    {
        $start = microtime(true);
        $boot = defined('LARAVEL_START') ? max(0.0, $start - (float) LARAVEL_START) : 0.0;
        $dbMs = 0.0;
        $queries = 0;

        try {
            DB::listen(function ($query) use (&$dbMs, &$queries): void {
                $dbMs += (float) $query->time;
                $queries++;
            });
        } catch (\Throwable) {
            // No database to listen to: the other figures still stand.
        }

        $response = $next($request);

        try {
            $appMs = max(0.0, (microtime(true) - $start) * 1000 - $dbMs);
            $response->headers->set('Server-Timing', sprintf(
                'boot;dur=%.1f, db;dur=%.1f;desc="%d queries", app;dur=%.1f',
                $boot * 1000,
                $dbMs,
                $queries,
                $appMs,
            ));
        } catch (\Throwable) {
            // A response that takes no headers goes out as it is.
        }

        return $response;
    }
}
