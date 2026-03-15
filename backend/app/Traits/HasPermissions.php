<?php

declare(strict_types=1);

namespace App\Traits;

use App\Models\Permission;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

trait HasPermissions
{
    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'user_permission')
            ->withPivot('granted', 'granted_by')
            ->withTimestamps();
    }

    /**
     * Check if the user has a given permission slug.
     *
     * Resolution order:
     *   1. Owner role → always true (bypass all checks)
     *   2. User-level override (explicit grant or deny)
     *   3. Role-level default
     */
    public function hasPermission(string $slug): bool
    {
        $this->loadMissing('role');

        if ($this->role?->slug === 'owner') {
            return true;
        }

        // User-level override
        $override = $this->permissions()->where('slug', $slug)->first();
        if ($override !== null) {
            return (bool) $override->pivot->granted;
        }

        // Role default
        if ($this->role) {
            return $this->role->permissions()->where('slug', $slug)->exists();
        }

        return false;
    }

    public function grantPermission(string $slug, ?int $grantedBy = null): void
    {
        $permission = Permission::where('slug', $slug)->first();
        if (!$permission) {
            return;
        }

        $this->permissions()->syncWithoutDetaching([
            $permission->id => ['granted' => true, 'granted_by' => $grantedBy],
        ]);
    }

    public function revokePermission(string $slug, ?int $grantedBy = null): void
    {
        $permission = Permission::where('slug', $slug)->first();
        if (!$permission) {
            return;
        }

        $this->permissions()->syncWithoutDetaching([
            $permission->id => ['granted' => false, 'granted_by' => $grantedBy],
        ]);
    }

    public function resetPermission(string $slug): void
    {
        $permission = Permission::where('slug', $slug)->first();
        if ($permission) {
            $this->permissions()->detach($permission->id);
        }
    }

    /**
     * Get all effective permissions with source info.
     * Returns array of ['slug', 'name', 'group', 'granted', 'source' => 'owner'|'override'|'role']
     */
    public function getEffectivePermissions(): array
    {
        $this->loadMissing('role');

        if ($this->role?->slug === 'owner') {
            return Permission::all()->map(fn (Permission $p) => [
                'slug'    => $p->slug,
                'name'    => $p->name,
                'group'   => $p->group,
                'granted' => true,
                'source'  => 'owner',
            ])->toArray();
        }

        $allPermissions = Permission::orderBy('group')->orderBy('name')->get();
        $userOverrides  = $this->permissions()->get()->keyBy('slug');
        $rolePerms      = $this->role
            ? $this->role->permissions()->pluck('slug')->flip()
            : collect();

        return $allPermissions->map(function (Permission $p) use ($userOverrides, $rolePerms) {
            $override = $userOverrides->get($p->slug);
            if ($override) {
                return [
                    'slug'    => $p->slug,
                    'name'    => $p->name,
                    'group'   => $p->group,
                    'granted' => (bool) $override->pivot->granted,
                    'source'  => 'override',
                ];
            }

            return [
                'slug'    => $p->slug,
                'name'    => $p->name,
                'group'   => $p->group,
                'granted' => $rolePerms->has($p->slug),
                'source'  => 'role',
            ];
        })->toArray();
    }
}
