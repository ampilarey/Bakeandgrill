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
        return app(\App\Services\PermissionService::class)->hasPermission($this, $slug);
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
        return app(\App\Services\PermissionService::class)->effectivePermissions($this);
    }
}
