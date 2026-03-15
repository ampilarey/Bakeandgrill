<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PermissionController extends Controller
{
    /** GET /api/permissions — list all permissions grouped */
    public function index(): JsonResponse
    {
        $grouped = Permission::orderBy('group')->orderBy('name')->get()
            ->groupBy('group')
            ->map(fn ($perms) => $perms->values());

        return response()->json(['permissions' => $grouped]);
    }

    /** GET /api/users/{user}/permissions — user's effective permissions */
    public function show(User $user): JsonResponse
    {
        $user->load('role');

        return response()->json([
            'user_id'     => $user->id,
            'name'        => $user->name,
            'role'        => $user->role?->slug,
            'permissions' => $user->getEffectivePermissions(),
        ]);
    }

    /**
     * PUT /api/users/{user}/permissions — bulk update user overrides.
     *
     * Body: { "permissions": { "reports.view": true, "orders.void": false, "inventory.manage": null } }
     * - true  = explicitly grant
     * - false = explicitly deny
     * - null  = remove override (revert to role default)
     */
    public function update(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'permissions'   => 'required|array',
            'permissions.*' => 'nullable|boolean',
        ]);

        $actorId = $request->user()?->id;

        foreach ($validated['permissions'] as $slug => $value) {
            if ($value === null) {
                $user->resetPermission($slug);
            } elseif ($value === true) {
                $user->grantPermission($slug, $actorId);
            } else {
                $user->revokePermission($slug, $actorId);
            }
        }

        $user->load('role');

        return response()->json([
            'message'     => 'Permissions updated.',
            'permissions' => $user->getEffectivePermissions(),
        ]);
    }
}
