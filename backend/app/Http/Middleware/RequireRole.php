<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\Customer;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Enforce role-based access on staff routes.
 *
 * Usage in routes:
 *   ->middleware('role:admin,owner')
 *   ->middleware('role:manager,admin,owner')
 *
 * Role slugs expected in the roles.slug column:
 *   owner, admin, manager, cashier, kitchen
 *
 * Rules:
 *   1. Unauthenticated requests → 401
 *   2. Customer tokens (App\Models\Customer) → always 403 on staff routes
 *   3. Staff with no role loaded → 403
 *   4. Staff role slug not in allowed list → 403
 */
class RequireRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // Customer tokens must never reach staff/admin routes
        if ($user instanceof Customer) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // Load role relationship if not already loaded
        if (!$user->relationLoaded('role')) {
            $user->load('role');
        }

        $roleSlug = $user->role?->slug;

        if (!$roleSlug || !in_array($roleSlug, $roles, true)) {
            return response()->json(['message' => 'Forbidden. Insufficient role.'], 403);
        }

        return $next($request);
    }
}
