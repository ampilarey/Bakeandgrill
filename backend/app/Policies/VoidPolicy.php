<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;

class VoidPolicy
{
    public function void(User $user): bool
    {
        return in_array($user->role?->slug, ['owner', 'admin', 'manager'], true);
    }
}
