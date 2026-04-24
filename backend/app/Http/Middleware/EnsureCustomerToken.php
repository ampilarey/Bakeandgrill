<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\Customer;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Enforce that the authenticated user is a Customer.
 *
 * Accepts two auth paths:
 *   1. Sanctum Bearer token — the token must carry the 'customer' ability.
 *   2. Session cookie via the 'customer' guard — set when the customer logs in
 *      on either the Blade site or the React order app (unified auth).
 *
 * Apply after 'auth:sanctum' in the middleware stack:
 *   Route::middleware(['auth:sanctum', 'customer.token'])->...
 *
 * For session-only routes (e.g. GET /api/auth/customer/check), skip auth:sanctum
 * and use the 'customer' guard directly — see api.php.
 */
class EnsureCustomerToken
{
    public function handle(Request $request, Closure $next): Response
    {
        // Primary path: Sanctum resolved a user via Bearer token
        $user = $request->user();

        // Fallback: check session-based customer guard (no Bearer token present)
        if (! $user && ! $request->bearerToken()) {
            $user = Auth::guard('customer')->user();
        }

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Must be a Customer model instance, not a staff User
        if (! ($user instanceof Customer)) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        if (! $user->is_active) {
            return response()->json(['message' => 'This account has been deactivated.'], 403);
        }

        // Token ability check only when a Bearer token was presented;
        // session auth does not carry token abilities.
        if ($request->bearerToken() && ! $user->tokenCan('customer')) {
            return response()->json(['message' => 'Forbidden — insufficient token scope.'], 403);
        }

        return $next($request);
    }
}
