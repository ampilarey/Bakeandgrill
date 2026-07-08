<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\Customer;
use App\Models\User;
use App\Services\PermissionService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Passes when the user holds at least one of the listed permission slugs. */
class RequireAnyPermission
{
    public function __construct(private readonly PermissionService $permissions) {}

    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($user instanceof Customer) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        if (!($user instanceof User)) {
            return response()->json(['message' => 'Forbidden — staff access only.'], 403);
        }

        if ($request->bearerToken() && !$user->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden — insufficient token scope.'], 403);
        }

        foreach ($permissions as $permission) {
            if ($this->permissions->hasPermission($user, $permission)) {
                return $next($request);
            }
        }

        return response()->json([
            'message' => 'You do not have permission to perform this action.',
            'required_any' => $permissions,
        ], 403);
    }
}
