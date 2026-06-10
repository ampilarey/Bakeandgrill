<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Repositories;

use App\Models\LoyaltyAccount;
use App\Services\LoyaltySettingsService;
use Illuminate\Support\Facades\DB;

class EloquentLoyaltyAccountRepository implements LoyaltyAccountRepositoryInterface
{
    public function __construct(
        private readonly LoyaltySettingsService $settings,
    ) {}

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
                    'tier' => $this->settings->tierForLifetimePoints($newLifetime),
                ]);

            DB::table('loyalty_accounts')
                ->where('customer_id', $customerId)
                ->increment('lifetime_points', $addLifetime);

            return;
        }

        DB::table('loyalty_accounts')->where('customer_id', $customerId)->update(['points_balance' => $balance]);
    }

    public function decrementPointsHeld(int $customerId, int $points): void
    {
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
