<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\DeliveryDriver;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Enforce that the authenticated model is a DeliveryDriver with a driver-scoped token.
 *
 * Apply after 'auth:sanctum' in the middleware stack:
 *   Route::middleware(['auth:sanctum', 'driver.token'])->...
 */
class EnsureDriverToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if (!($user instanceof DeliveryDriver)) {
            return response()->json(['message' => 'Forbidden — driver access only.'], 403);
        }

        if (!$user->tokenCan('driver')) {
            return response()->json(['message' => 'Forbidden — insufficient token scope.'], 403);
        }

        return $next($request);
    }
}
