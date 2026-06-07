<?php

declare(strict_types=1);

namespace App\Domains\Permissions\Services;

use App\Domains\Permissions\PermissionCatalog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;

/**
 * Central permission resolver — owner bypass, user override, role default.
 */
class PermissionService
{
    public function isOwner(User $user): bool
    {
        $user->loadMissing('role');

        return $user->role?->slug === 'owner';
    }

    public function hasPermission(User $user, string $slug): bool
    {
        if ($this->isOwner($user)) {
            return true;
        }

        foreach (PermissionCatalog::expandCheckSlugs($slug) as $checkSlug) {
            if ($this->resolveSingleSlug($user, $checkSlug)) {
                return true;
            }
        }

        return false;
    }

    /** @return list<string> */
    public function grantedSlugs(User $user): array
    {
        if ($this->isOwner($user)) {
            return Permission::orderBy('slug')->pluck('slug')->all();
        }

        return Permission::orderBy('slug')->get()
            ->filter(fn (Permission $p) => $this->hasPermission($user, $p->slug))
            ->pluck('slug')
            ->values()
            ->all();
    }

    /**
     * @return list<array{
     *   slug: string,
     *   name: string,
     *   group: string,
     *   granted: bool,
     *   role_default: bool,
     *   override_mode: 'inherit'|'allow'|'deny',
     *   source: 'owner'|'role'|'override'
     * }>
     */
    public function effectivePermissions(User $user): array
    {
        $user->loadMissing('role');

        if ($this->isOwner($user)) {
            return Permission::orderBy('group')->orderBy('name')->get()->map(fn (Permission $p) => [
                'slug' => $p->slug,
                'name' => $p->name,
                'group' => $p->group,
                'granted' => true,
                'role_default' => true,
                'override_mode' => 'inherit',
                'source' => 'owner',
            ])->all();
        }

        $allPermissions = Permission::orderBy('group')->orderBy('name')->get();
        $userOverrides = $user->permissions()->get()->keyBy('slug');
        $rolePerms = $user->role
            ? $user->role->permissions()->pluck('slug')->flip()
            : collect();

        return $allPermissions->map(function (Permission $p) use ($userOverrides, $rolePerms, $user) {
            $roleDefault = $rolePerms->has($p->slug);
            $override = $userOverrides->get($p->slug);

            if ($override !== null) {
                $granted = (bool) $override->pivot->granted;

                return [
                    'slug' => $p->slug,
                    'name' => $p->name,
                    'group' => $p->group,
                    'granted' => $granted,
                    'role_default' => $roleDefault,
                    'override_mode' => $granted ? 'allow' : 'deny',
                    'source' => 'override',
                ];
            }

            $granted = $this->hasPermission($user, $p->slug);

            return [
                'slug' => $p->slug,
                'name' => $p->name,
                'group' => $p->group,
                'granted' => $granted,
                'role_default' => $roleDefault,
                'override_mode' => 'inherit',
                'source' => 'role',
            ];
        })->all();
    }

    /**
     * @return list<array{slug: string, name: string, group: string, granted: bool}>
     */
    public function rolePermissions(string $roleSlug): array
    {
        $all = Permission::orderBy('group')->orderBy('name')->get();

        if ($roleSlug === 'owner') {
            return $all->map(fn (Permission $p) => [
                'slug' => $p->slug,
                'name' => $p->name,
                'group' => $p->group,
                'granted' => true,
            ])->all();
        }

        $role = Role::where('slug', $roleSlug)->firstOrFail();
        $rolePermSlugs = $role->permissions()->pluck('slug')->flip();

        return $all->map(fn (Permission $p) => [
            'slug' => $p->slug,
            'name' => $p->name,
            'group' => $p->group,
            'granted' => $rolePermSlugs->has($p->slug),
        ])->all();
    }

    public function syncRolePermissions(string $roleSlug, array $permissions): void
    {
        if ($roleSlug === 'owner') {
            return;
        }

        $role = Role::where('slug', $roleSlug)->firstOrFail();
        $grantIds = [];

        foreach ($permissions as $slug => $granted) {
            if (!$granted) {
                continue;
            }
            $perm = Permission::where('slug', $slug)->first();
            if ($perm) {
                $grantIds[] = $perm->id;
            }
        }

        $role->permissions()->sync($grantIds);
    }

    private function resolveSingleSlug(User $user, string $slug): bool
    {
        $user->loadMissing('permissions', 'role.permissions');
        $override = $user->permissions->firstWhere('slug', $slug);
        if ($override !== null) {
            return (bool) $override->pivot->granted;
        }

        if ($user->role && $user->role->permissions->contains('slug', $slug)) {
            return true;
        }

        return false;
    }
}
