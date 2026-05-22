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
            'user_id' => $user->id,
            'name' => $user->name,
            'role' => $user->role?->slug,
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
            'permissions' => 'required|array',
            'permissions.*' => 'nullable|boolean',
        ]);

        $actor = $request->user();
        $actorId = $actor?->id;

        // Prevent modifying own permissions or any owner account
        abort_if($actorId === $user->id, 403, 'You cannot modify your own permissions.');
        abort_if($user->role?->slug === 'owner', 403, 'Owner permissions cannot be modified — owners always have full access.');

        // Authorization rule: you can only touch (grant/revoke/reset) a
        // permission you yourself hold. Owners are exempt because owner
        // short-circuits hasPermission() and is the source of all grants.
        //
        // Pre-fix only the grant arm checked this — revoke and reset slipped
        // through, so a non-owner could strip permissions they didn't hold
        // (e.g. a manager revoking integrations.xero from an owner-delegated
        // power user). Same gate now applies uniformly.
        $isOwner = $actor?->role?->slug === 'owner';
        foreach ($validated['permissions'] as $slug => $value) {
            if (!$isOwner && !$actor->hasPermission($slug)) {
                $verb = $value === null ? 'reset' : ($value === true ? 'grant' : 'revoke');
                abort(403, "You cannot {$verb} the '{$slug}' permission you do not hold.");
            }

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
            'message' => 'Permissions updated.',
            'permissions' => $user->getEffectivePermissions(),
        ]);
    }
}
