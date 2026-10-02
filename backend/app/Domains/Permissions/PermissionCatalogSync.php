<?php

declare(strict_types=1);

namespace App\Domains\Permissions;

use App\Models\Permission;
use App\Models\Role;

final class PermissionCatalogSync
{
    /** @var list<string> */
    public const ROLES = ['owner', 'manager', 'staff', 'kitchen_staff'];

    /**
     * Bring the permission rows and the four stock roles in line with the
     * catalog. The owner's own changes to a role (RolePermissionCustomisations)
     * are applied on top, so a sync never undoes them (permissions audit,
     * 2026-10-02: it used to, on every deploy).
     */
    public static function sync(): void
    {
        foreach (PermissionCatalog::definitions() as $perm) {
            Permission::updateOrCreate(
                ['slug' => $perm['slug']],
                [
                    'name' => $perm['name'],
                    'group' => $perm['group'],
                    'description' => $perm['description'] ?? null,
                ],
            );
        }

        foreach (self::ROLES as $slug) {
            $role = Role::where('slug', $slug)->first();
            if ($role) {
                $role->permissions()->sync(
                    Permission::whereIn('slug', RolePermissionCustomisations::expectedSlugs($slug))->pluck('id'),
                );
            }
        }
    }
}
