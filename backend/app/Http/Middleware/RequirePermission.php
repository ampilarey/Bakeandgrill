<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\PermissionService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequirePermission
{
    public function __construct(private readonly PermissionService $permissions) {}

    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($user instanceof \App\Models\Customer) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        foreach ($permissions as $permission) {
            if (!$this->permissions->hasPermission($user, $permission)) {
                return response()->json([
                    'message' => 'You do not have permission to perform this action.',
                    'required' => $permission,
                ], 403);
            }
        }

        return $next($request);
    }
}
