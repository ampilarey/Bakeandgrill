<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\SearchVisibility;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Adds `X-Robots-Tag: noindex, nofollow` to every TEST response and to the
 * private token pages on the live site. See SearchVisibility.
 */
class SearchEngineDirectives
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (SearchVisibility::isTestHost($request) || SearchVisibility::isPrivatePath($request->getPathInfo())) {
            $response->headers->set('X-Robots-Tag', 'noindex, nofollow');
        }

        return $response;
    }
}
