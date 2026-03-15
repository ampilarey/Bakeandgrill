<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\Customer;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequirePermission
{
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Customer tokens must never reach staff/admin routes
        if ($user instanceof Customer) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        foreach ($permissions as $permission) {
            if (!$user->hasPermission($permission)) {
                return response()->json([
                    'message' => 'You do not have permission to perform this action.',
                    'required' => $permission,
                ], 403);
            }
        }

        return $next($request);
    }
}
