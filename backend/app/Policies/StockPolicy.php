<?php

namespace App\Policies;

use App\Models\User;

class StockPolicy
{
    public function manage(User $user): bool
    {
        return in_array($user->role?->slug, ['owner', 'admin', 'manager'], true);
    }
}
