<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;

class DevicePolicy
{
    public function manage(User $user): bool
    {
        return in_array($user->role?->slug, ['owner', 'admin'], true);
    }
}
