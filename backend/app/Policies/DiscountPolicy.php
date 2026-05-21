<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;

class DiscountPolicy
{
    public function apply(User $user): bool
    {
        if ($user->role?->slug === 'owner') {
            return true;
        }
        $user->loadMissing('permissions');
        $override = $user->permissions->firstWhere('slug', 'promotions.discounts');
        if ($override !== null) {
            return (bool) $override->pivot->granted;
        }

        // Discounts default-allow for cashiers too (STAFF_GRANTED in
        // PermissionSeeder includes promotions.discounts).
        return in_array($user->role?->slug, ['owner', 'manager', 'staff'], true);
    }
}
