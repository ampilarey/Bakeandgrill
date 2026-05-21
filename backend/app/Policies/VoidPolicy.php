<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;

class VoidPolicy
{
    public function void(User $user): bool
    {
        // Per-user override wins first (Settings → Roles & Permissions
        // can explicitly grant/deny orders.void for a specific user).
        // Falls back to role-default ['owner','manager'] when no
        // explicit override exists — preserves the original behavior
        // for environments / tests where the permission rows haven't
        // been seeded yet.
        if ($user->role?->slug === 'owner') {
            return true; // Owner always bypasses (matches HasPermissions)
        }
        $user->loadMissing('permissions');
        $override = $user->permissions->firstWhere('slug', 'orders.void');
        if ($override !== null) {
            return (bool) $override->pivot->granted;
        }

        return in_array($user->role?->slug, ['owner', 'manager'], true);
    }
}
