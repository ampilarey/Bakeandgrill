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

        $this->permissions->syncRolePermissions($slug, $validated['permissions']);

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
