<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken as Middleware;
use Illuminate\Http\Request;

/**
 * Skip CSRF for Bearer-authenticated API requests.
 *
 * Sanctum's statefulApi() runs CSRF on same-origin SPA requests (Origin/Referer
 * match SANCTUM_STATEFUL_DOMAINS). POS and admin authenticate with Sanctum
 * personal access tokens in the Authorization header — not session cookies.
 * CSRF is for cookie sessions; requiring it for Bearer calls breaks when a
 * stale XSRF-TOKEN cookie exists (common with SESSION_DOMAIN=.bakeandgrill.mv
 * shared across test/prod).
 */
class ValidateCsrfToken extends Middleware
{
    public function handle($request, Closure $next)
    {
        if ($this->hasBearerToken($request)) {
            return $next($request);
        }

        return parent::handle($request, $next);
    }

    protected function hasBearerToken(Request $request): bool
    {
        $header = $request->header('Authorization', '');

        return is_string($header) && str_starts_with($header, 'Bearer ');
    }
}
