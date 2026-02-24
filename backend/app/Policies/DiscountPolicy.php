<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;

class DiscountPolicy
{
    public function apply(User $user): bool
    {
        return in_array($user->role?->slug, ['owner', 'admin', 'manager'], true);
    }
}
