<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Repositories;

use App\Models\LoyaltyAccount;
use Illuminate\Support\Facades\DB;

class EloquentLoyaltyAccountRepository implements LoyaltyAccountRepositoryInterface
{
    public function getOrCreateAccount(int $customerId): LoyaltyAccount
    {
        return LoyaltyAccount::firstOrCreate(
            ['customer_id' => $customerId],
            ['points_balance' => 0, 'points_held' => 0, 'lifetime_points' => 0, 'tier' => 'bronze'],
        );
    }

    public function lockAccount(int $customerId): ?LoyaltyAccount
    {
        return LoyaltyAccount::where('customer_id', $customerId)->lockForUpdate()->first();
    }

    public function incrementPointsHeld(int $customerId, int $points): void
    {
        DB::table('loyalty_accounts')
            ->where('customer_id', $customerId)
            ->increment('points_held', $points);
    }

    public function updateBalance(int $customerId, int $balance, ?int $addLifetime = null): void
    {
        $update = ['points_balance' => $balance];

        if ($addLifetime !== null) {
            DB::table('loyalty_accounts')
                ->where('customer_id', $customerId)
                ->update([
                    'points_balance' => $balance,
                    'lifetime_points' => DB::raw('lifetime_points + ' . (int) $addLifetime),
                ]);

            return;
        }

        DB::table('loyalty_accounts')->where('customer_id', $customerId)->update($update);
    }

    public function decrementPointsHeld(int $customerId, int $points): void
    {
        DB::table('loyalty_accounts')
            ->where('customer_id', $customerId)
            ->update([
                'points_held' => DB::raw('MAX(0, points_held - ' . (int) $points . ')'),
            ]);
    }
}
