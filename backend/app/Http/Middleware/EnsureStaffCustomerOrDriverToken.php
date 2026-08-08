<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\Customer;
use App\Models\DeliveryDriver;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Allow staff, customer, or driver actors (for shared tracking endpoints).
 */
class EnsureStaffCustomerOrDriverToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user && !$request->bearerToken()) {
            $user = Auth::guard('customer')->user();
            if ($user) {
                Auth::setUser($user);
            }
        }

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($user instanceof User) {
            if ($user->currentAccessToken() !== null && !$user->tokenCan('staff')) {
                return response()->json(['message' => 'Forbidden — insufficient token scope.'], 403);
            }

            if (!($user->fresh()?->is_active ?? false)) {
                return response()->json(['message' => 'This account has been deactivated.'], 403);
            }

            return $next($request);
        }

        if ($user instanceof Customer) {
            if (!($user->fresh()?->is_active ?? false)) {
                return response()->json(['message' => 'This account has been deactivated.'], 403);
            }
            if ($user->currentAccessToken() !== null && !$user->tokenCan('customer')) {
                return response()->json(['message' => 'Forbidden — insufficient token scope.'], 403);
            }

            return $next($request);
        }

        if ($user instanceof DeliveryDriver) {
            if ($user->currentAccessToken() !== null && !$user->tokenCan('driver')) {
                return response()->json(['message' => 'Forbidden — insufficient token scope.'], 403);
            }

            if (!($user->fresh()?->is_active ?? false)) {
                return response()->json(['message' => 'This account has been deactivated.'], 403);
            }

            return $next($request);
        }

        return response()->json(['message' => 'Forbidden.'], 403);
    }
}
