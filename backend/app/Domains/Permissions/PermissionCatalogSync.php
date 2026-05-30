<?php

declare(strict_types=1);

namespace App\Domains\Permissions;

use App\Models\Permission;
use App\Models\Role;

final class PermissionCatalogSync
{
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

        $owner = Role::where('slug', 'owner')->first();
        if ($owner) {
            $owner->permissions()->sync(
                Permission::whereIn('slug', PermissionCatalog::ownerSlugs())->pluck('id'),
            );
        }

        $manager = Role::where('slug', 'manager')->first();
        if ($manager) {
            $manager->permissions()->sync(
                Permission::whereIn('slug', PermissionCatalog::managerSlugs())->pluck('id'),
            );
        }

        $staff = Role::where('slug', 'staff')->first();
        if ($staff) {
            $staff->permissions()->sync(
                Permission::whereIn('slug', PermissionCatalog::staffSlugs())->pluck('id'),
            );
        }

        $kitchenStaff = Role::where('slug', 'kitchen_staff')->first();
        if ($kitchenStaff) {
            $kitchenStaff->permissions()->sync(
                Permission::whereIn('slug', PermissionCatalog::kitchenStaffSlugs())->pluck('id'),
            );
        }
    }
}
