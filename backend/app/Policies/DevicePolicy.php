<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;

class DevicePolicy
{
    public function manage(User $user): bool
    {
        if ($user->role?->slug === 'owner') {
            return true;
        }
        $user->loadMissing('permissions');
        $override = $user->permissions->firstWhere('slug', 'devices.manage');
        if ($override !== null) {
            return (bool) $override->pivot->granted;
        }

        return $user->role?->slug === 'owner';
    }
}
