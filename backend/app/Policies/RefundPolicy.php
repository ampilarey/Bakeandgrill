<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;
use App\Services\PermissionService;

class RefundPolicy
{
    public function __construct(private readonly PermissionService $permissions) {}

    public function process(User $user): bool
    {
        return $this->permissions->hasPermission($user, 'orders.refund');
    }
}
