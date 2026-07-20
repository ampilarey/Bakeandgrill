<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\Customer;
use App\Support\SanctumBearerResolver;
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
 *
 * Sanctum's guard list is [web, customer]. A concurrent staff web session would
 * otherwise shadow the ordering customer on /api/customer/* — prefer the
 * customer session (and customer bearer) on these routes.
 */
class EnsureCustomerToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Prefer an explicit customer bearer when present so a concurrent staff
        // web session cannot shadow customer API access.
        if ($request->bearerToken()) {
            if (SanctumBearerResolver::bearerTokenIsInvalid($request)) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }

            $customerFromBearer = SanctumBearerResolver::resolveTokenable($request, Customer::class);
            if ($customerFromBearer instanceof Customer) {
                $user = $customerFromBearer;
                $request->setUserResolver(static fn () => $user);
            } elseif (!($user instanceof Customer)) {
                // Staff/driver/other bearer (or web session User) on a customer route.
                return response()->json(['message' => 'Forbidden — customer access only.'], 403);
            }
        }

        // No bearer: prefer customer session over Sanctum's web-first user.
        if (!($user instanceof Customer)) {
            $sessionCustomer = Auth::guard('customer')->user();
            if ($sessionCustomer instanceof Customer) {
                $user = $sessionCustomer;
                $request->setUserResolver(static fn () => $user);
            }
        }

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if (!($user instanceof Customer)) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        if (!$user->is_active) {
            return response()->json(['message' => 'This account has been deactivated.'], 403);
        }

        // Token ability check only when a Bearer token was presented;
        // session auth does not carry token abilities.
        if ($request->bearerToken() && !$user->tokenCan('customer')) {
            return response()->json(['message' => 'Forbidden — insufficient token scope.'], 403);
        }

        $request->setUserResolver(static fn () => $user);

        return $next($request);
    }
}
