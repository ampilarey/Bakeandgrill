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
        if ($addLifetime !== null) {
            $account = LoyaltyAccount::where('customer_id', $customerId)->first();
            $newLifetime = ($account?->lifetime_points ?? 0) + $addLifetime;

            DB::table('loyalty_accounts')
                ->where('customer_id', $customerId)
                ->update([
                    'points_balance' => $balance,
                    'lifetime_points' => DB::raw('lifetime_points + ' . (int) $addLifetime),
                    'tier' => $this->tierForLifetimePoints($newLifetime),
                ]);

            return;
        }

        DB::table('loyalty_accounts')->where('customer_id', $customerId)->update(['points_balance' => $balance]);
    }

    private function tierForLifetimePoints(int $lifetime): string
    {
        return match (true) {
            $lifetime >= 15000 => 'platinum',
            $lifetime >= 5000 => 'gold',
            $lifetime >= 1000 => 'silver',
            default => 'bronze',
        };
    }

    public function decrementPointsHeld(int $customerId, int $points): void
    {
        // CASE expression is compatible with both MySQL and SQLite (tests).
        // GREATEST() is MySQL-only and crashes on SQLite.
        DB::table('loyalty_accounts')
            ->where('customer_id', $customerId)
            ->update([
                'points_held' => DB::raw(
                    'CASE WHEN points_held > ' . (int) $points
                    . ' THEN points_held - ' . (int) $points
                    . ' ELSE 0 END',
                ),
            ]);
    }
}
