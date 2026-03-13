<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\Customer;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Enforce that the authenticated user is a Customer with a customer-scoped token.
 *
 * Two conditions must both be true:
 *   1. The Sanctum token has the 'customer' ability (set at issuance by CustomerAuthController).
 *   2. The resolved model is App\Models\Customer (not a staff User).
 *
 * This blocks:
 *   - Staff tokens (ability = 'staff') from reaching customer-only routes.
 *   - Any future token type that lacks explicit 'customer' ability.
 *
 * Apply after 'auth:sanctum' in the middleware stack:
 *   Route::middleware(['auth:sanctum', 'customer.token'])->...
 */
class EnsureCustomerToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Must be a Customer model instance, not a staff User
        if (! ($user instanceof Customer)) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        // Must carry the 'customer' ability on the token
        if (! $user->tokenCan('customer')) {
            return response()->json(['message' => 'Forbidden — insufficient token scope.'], 403);
        }

        return $next($request);
    }
}
