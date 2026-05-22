<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;
use App\Services\PermissionService;

class DevicePolicy
{
    public function __construct(private readonly PermissionService $permissions) {}

    public function manage(User $user): bool
    {
        return $this->permissions->hasPermission($user, 'devices.manage');
    }

    public function approve(User $user): bool
    {
        return $this->permissions->hasPermission($user, 'devices.approve');
    }
}
