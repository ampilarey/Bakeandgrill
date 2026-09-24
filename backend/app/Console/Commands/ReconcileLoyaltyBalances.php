<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\LoyaltyAccount;
use App\Models\LoyaltyLedger;
use Illuminate\Console\Command;

/**
 * Reconciles loyalty account balances against the ledger.
 * Run periodically to detect and fix any drift caused by failed jobs.
 */
class ReconcileLoyaltyBalances extends Command
{
    protected $signature = 'app:reconcile-loyalty-balances {--dry-run : Only report, do not fix}';

    protected $description = 'Reconcile loyalty account balances against the ledger';

    public function handle(): int
    {
        $accounts = LoyaltyAccount::all();
        $fixed = 0;
        $mismatches = [];

        foreach ($accounts as $account) {
            // MySQL hands SUM() back as a string; compared strictly to the
            // integer balance every account read as drift and was
            // "fixed" nightly to the value it already had (audit, 2026-09-24).
            $ledgerSum = (int) LoyaltyLedger::where('customer_id', $account->customer_id)
                ->sum('points');

            if ($ledgerSum !== (int) $account->points_balance) {
                $mismatches[] = [
                    'customer_id' => $account->customer_id,
                    'balance' => $account->points_balance,
                    'ledger_sum' => $ledgerSum,
                    'diff' => $ledgerSum - $account->points_balance,
                ];

                if (!$this->option('dry-run')) {
                    $account->update(['points_balance' => max(0, $ledgerSum)]);
                    $fixed++;
                }
            }
        }

        if (empty($mismatches)) {
            $this->info('All loyalty balances are correct.');
        } else {
            $this->table(
                ['customer_id', 'balance', 'ledger_sum', 'diff'],
                $mismatches,
            );

            if ($this->option('dry-run')) {
                $this->warn('Dry run: ' . count($mismatches) . ' mismatches found. Run without --dry-run to fix.');
            } else {
                $this->info("Fixed {$fixed} balance mismatches.");
            }
        }

        return self::SUCCESS;
    }
}
