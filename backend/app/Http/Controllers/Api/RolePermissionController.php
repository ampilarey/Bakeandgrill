<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AuditLogService;
use App\Services\PermissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RolePermissionController extends Controller
{
    public function __construct(
        private readonly PermissionService $permissions,
        private readonly AuditLogService $audit,
    ) {}

    /** GET /api/roles/{slug}/permissions */
    public function show(string $slug): JsonResponse
    {
        abort_unless(in_array($slug, ['owner', 'manager', 'staff', 'kitchen_staff'], true), 404, 'Unknown role.');

        return response()->json([
            'role' => $slug,
            'permissions' => $this->permissions->rolePermissions($slug),
        ]);
    }

    /**
     * PUT /api/roles/{slug}/permissions
     * Body: { "permissions": { "orders.void": true, "pos.access": false } }
     */
    public function update(Request $request, string $slug): JsonResponse
    {
        abort_if($slug === 'owner', 403, 'Owner permissions cannot be modified — owners always have full access.');

        abort_unless(in_array($slug, ['manager', 'staff', 'kitchen_staff'], true), 404, 'Unknown role.');

        $validated = $request->validate([
            'permissions' => 'required|array',
            'permissions.*' => 'required|boolean',
        ]);

        $oldPermissions = $this->permissions->rolePermissions($slug);

        // Staff audit, 2026-10-01: the per-person screen already stopped a
        // non-owner from handing out a permission they do not hold, but this
        // one did not, so anyone allowed to edit roles could give their own
        // role (and so themselves) everything. A non-owner now cannot edit
        // their own role, and can only switch on or off what they hold.
        $actor = $request->user();
        $actor?->loadMissing('role');
        if ($actor !== null && $actor->role?->slug !== 'owner') {
            abort_if($actor->role?->slug === $slug, 403, 'You cannot change the permissions of your own role.');

            $current = collect($oldPermissions)->pluck('granted', 'slug');
            foreach ($validated['permissions'] as $permission => $granted) {
                $changing = (bool) $granted !== (bool) ($current[$permission] ?? false);
                if ($changing && !$actor->hasPermission((string) $permission)) {
                    abort(403, "You cannot change the '{$permission}' permission you do not hold.");
                }
            }
        }

        // A permission left out of the request keeps its current setting
        // rather than being switched off, so a partial save cannot quietly
        // strip what it did not mention.
        $merged = array_merge(
            collect($oldPermissions)->pluck('granted', 'slug')->all(),
            $validated['permissions'],
        );
        $this->permissions->syncRolePermissions($slug, $merged);

        $this->audit->log(
            'role.permissions.updated',
            'Role',
            null,
            ['role' => $slug, 'permissions' => $oldPermissions],
            ['role' => $slug, 'permissions' => $this->permissions->rolePermissions($slug)],
            ['changed' => array_keys($validated['permissions'])],
            $request,
        );

        return response()->json([
            'message' => 'Role permissions updated.',
            'role' => $slug,
            'permissions' => $this->permissions->rolePermissions($slug),
        ]);
    }
}
