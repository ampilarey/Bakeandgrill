<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\LoyaltyAccount;
use App\Models\LoyaltyLedger;
use App\Services\LoyaltySettingsService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ExpireLoyaltyPoints extends Command
{
    protected $signature = 'app:expire-loyalty-points';

    protected $description = 'Expire loyalty points past their expires_at date';

    public function handle(LoyaltySettingsService $settings): int
    {
        if ($settings->pointsExpiryDays() <= 0) {
            $this->info('Points expiry disabled — nothing to do.');

            return self::SUCCESS;
        }

        $entries = LoyaltyLedger::query()
            ->whereIn('type', ['earn', 'bonus', 'admin_credit'])
            ->where('points', '>', 0)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->where('expiry_processed', false)
            ->orderBy('id')
            ->get();

        $expiredTotal = 0;

        foreach ($entries->groupBy('customer_id') as $customerId => $group) {
            DB::transaction(function () use ($customerId, $group, &$expiredTotal, $settings): void {
                $account = LoyaltyAccount::where('customer_id', $customerId)->lockForUpdate()->first();
                if (!$account || $account->points_balance <= 0) {
                    foreach ($group as $entry) {
                        $entry->update(['expiry_processed' => true]);
                    }

                    return;
                }

                $remainingBalance = (int) $account->points_balance;

                foreach ($group as $entry) {
                    if ($remainingBalance <= 0) {
                        $entry->update(['expiry_processed' => true]);

                        continue;
                    }

                    $toExpire = min($remainingBalance, (int) $entry->points);
                    if ($toExpire <= 0) {
                        $entry->update(['expiry_processed' => true]);

                        continue;
                    }

                    $remainingBalance -= $toExpire;
                    $newBalance = max(0, (int) $account->points_balance - $toExpire);
                    $account->points_balance = $newBalance;
                    $account->save();

                    LoyaltyLedger::create([
                        'idempotency_key' => 'expire:' . $entry->id,
                        'customer_id' => (int) $customerId,
                        'order_id' => $entry->order_id,
                        'type' => 'expire',
                        'points' => -$toExpire,
                        'balance_after' => $newBalance,
                        'notes' => 'Points expired',
                        'occurred_at' => now(),
                        'expiry_processed' => true,
                    ]);

                    $entry->update(['expiry_processed' => true]);
                    $expiredTotal += $toExpire;
                }

                $account->update(['tier' => $settings->tierForLifetimePoints((int) $account->lifetime_points)]);
            });
        }

        $this->info("Expired {$expiredTotal} loyalty points across {$entries->count()} credit entries.");

        return self::SUCCESS;
    }
}
