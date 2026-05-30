<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;
use App\Services\PermissionService;

class DiscountPolicy
{
    public function __construct(private readonly PermissionService $permissions) {}

    public function apply(User $user): bool
    {
        return $this->permissions->hasPermission($user, 'promotions.discounts');
    }
}
