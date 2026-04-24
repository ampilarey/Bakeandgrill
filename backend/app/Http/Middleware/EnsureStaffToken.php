<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Enforce that the authenticated user is a staff User with a staff-scoped token.
 *
 * Two conditions must both be true:
 *   1. The resolved model is App\Models\User (not a Customer).
 *   2. The Sanctum token has the 'staff' ability (set at issuance by StaffAuthController).
 *
 * This blocks customer tokens from reaching staff-only routes even if they somehow
 * pass auth:sanctum.
 *
 * Apply after 'auth:sanctum' in the middleware stack:
 *   Route::middleware(['auth:sanctum', 'staff.token'])->...
 */
class EnsureStaffToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Must be a staff User model, not a Customer
        if (! ($user instanceof User)) {
            return response()->json(['message' => 'Forbidden — staff access only.'], 403);
        }

        // Must carry the 'staff' ability on the token
        if (! $user->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden — insufficient token scope.'], 403);
        }

        return $next($request);
    }
}
