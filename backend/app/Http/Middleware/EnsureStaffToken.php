<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\SanctumBearerResolver;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Enforce that the authenticated user is a staff User.
 *
 * Accepts two auth paths:
 *   1. Sanctum Bearer token — must carry the 'staff' ability (POS/KDS PATs).
 *   2. Session cookie via the 'web' guard — set by admin SPA login (Sanctum stateful).
 *
 * Apply after 'auth:sanctum' in the middleware stack:
 *   Route::middleware(['auth:sanctum', 'staff.token'])->...
 */
class EnsureStaffToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Session guards run before Sanctum bearer resolution — prefer a valid staff
        // bearer token when present so a concurrent customer session cannot shadow it.
        if (!($user instanceof User) && $request->bearerToken()) {
            if (SanctumBearerResolver::bearerTokenIsInvalid($request)) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }

            $staffFromBearer = SanctumBearerResolver::resolveTokenable($request, User::class);
            if ($staffFromBearer instanceof User) {
                $user = $staffFromBearer;
                $request->setUserResolver(static fn () => $user);
            }
        }

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Must be a staff User model, not a Customer
        if (!($user instanceof User)) {
            return response()->json(['message' => 'Forbidden — staff access only.'], 403);
        }

        // Token ability check when authenticated via a Sanctum access token
        // (Bearer PAT or test actingAs). Session cookie auth has no token.
        if ($user->currentAccessToken() !== null && !$user->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden — insufficient token scope.'], 403);
        }

        // Reload from DB — Auth may hold a stale model after deactivation
        // (tests / long-lived workers). Eloquent attributes are not real properties.
        if (!($user->fresh()?->is_active ?? false)) {
            return response()->json(['message' => 'Forbidden — account disabled.'], 403);
        }

        return $next($request);
    }
}
