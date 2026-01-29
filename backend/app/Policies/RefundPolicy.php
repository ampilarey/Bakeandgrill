<?php

namespace App\Policies;

use App\Models\User;

class RefundPolicy
{
    public function process(User $user): bool
    {
        return in_array($user->role?->slug, ['owner', 'admin', 'manager'], true);
    }
}
