<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;
use App\Services\PermissionService;

class CashPolicy
{
    public function __construct(private readonly PermissionService $permissions) {}

    public function manage(User $user): bool
    {
        return $this->permissions->hasPermission($user, 'payments.cash_manage')
            || $this->permissions->hasPermission($user, 'finance.cash_manage');
    }
}
