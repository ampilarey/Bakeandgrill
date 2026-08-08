<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;
use App\Services\PermissionService;

class RefundPolicy
{
    public function __construct(private readonly PermissionService $permissions) {}

    /** Raise a refund request (cashier). */
    public function request(User $user): bool
    {
        return $this->permissions->hasPermission($user, 'orders.refund_request')
            || $this->permissions->hasPermission($user, 'orders.refund');
    }

    /** Approve / reject (and historically process) refunds. */
    public function process(User $user): bool
    {
        return $this->permissions->hasPermission($user, 'orders.refund');
    }
}
