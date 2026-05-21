<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;

class RefundPolicy
{
    public function process(User $user): bool
    {
        // Per-user override → role-default fallback. See VoidPolicy for
        // the full rationale (this pattern preserves test compatibility
        // when permission rows aren't seeded).
        if ($user->role?->slug === 'owner') {
            return true;
        }
        $user->loadMissing('permissions');
        $override = $user->permissions->firstWhere('slug', 'orders.refund');
        if ($override !== null) {
            return (bool) $override->pivot->granted;
        }

        return in_array($user->role?->slug, ['owner', 'manager'], true);
    }
}
