<?php

declare(strict_types=1);

namespace App\Domains\Deposits\Support;

use App\Models\User;

/**
 * Who the ledger names when the customer moves their own wallet money (a
 * gift card in, a card top-up, paying an order from it): the owner, as the
 * gateway settlements do. The ledger needs an actor and the customer is not
 * a staff member.
 */
final class WalletActor
{
    public static function system(): User
    {
        $actor = User::query()
            ->where('is_active', true)
            ->whereHas('role', fn ($q) => $q->where('slug', 'owner'))
            ->orderBy('id')
            ->first();
        abort_if($actor === null, 503, 'The wallet is not available right now.');

        return $actor;
    }
}
