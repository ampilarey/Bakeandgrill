<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;

class SmsPolicy
{
    public function send(User $user): bool
    {
        if ($user->role?->slug === 'owner') {
            return true;
        }
        $user->loadMissing('permissions');
        $override = $user->permissions->firstWhere('slug', 'integrations.sms');
        if ($override !== null) {
            return (bool) $override->pivot->granted;
        }

        return in_array($user->role?->slug, ['owner', 'manager'], true);
    }
}
