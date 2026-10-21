<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Deposits\Services\DepositLedgerService;
use App\Domains\Deposits\Support\DepositHolds;
use App\Domains\Deposits\Support\WalletActor;
use App\Models\Customer;
use App\Models\CustomerDepositAccount;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Phase 4 (owner, 2026-10-21): a customer who keeps money in the wallet and
 * buys on account can have the account paid from the wallet every night,
 * so nothing goes overdue while money sits there. The switch is on the
 * customer (Admin → Customer → Credit, or the order app's Account → Credit);
 * the move is the ordinary deposit-to-credit transfer, so the customer gets
 * the repayment text ("from your wallet") and both ledgers carry it. Money
 * on hold for an unpaid online order is left alone.
 */
class SettleCreditFromWallet extends Command
{
    protected $signature = 'credit:settle-from-wallet';

    protected $description = "Pay each opted-in customer's credit balance from their wallet";

    public function handle(DepositLedgerService $deposits): int
    {
        $customers = Customer::query()
            ->where('credit_settle_from_wallet', true)
            ->where('credit_enabled', true)
            ->where('credit_status', 'active')
            ->where('credit_balance_laar', '>', 0)
            ->whereDoesntHave('tradeAccount')
            ->orderBy('id')
            ->get();

        $settled = 0;
        $movedLaar = 0;
        $actor = null;
        foreach ($customers as $customer) {
            $account = CustomerDepositAccount::query()->where('customer_id', $customer->id)->first();
            if ($account === null || $account->status !== 'active') {
                continue;
            }
            $available = (int) $account->balance_laar - DepositHolds::heldLaar($customer->id);
            $amount = min($available, (int) $customer->credit_balance_laar);
            if ($amount <= 0) {
                continue;
            }
            try {
                $actor ??= WalletActor::system();
                $result = $deposits->transferToCredit($customer, $amount, $actor, 'Settled from the wallet (nightly, the customer asked for it)');
                $settled++;
                $movedLaar += (int) $result['amount_laar'];
            } catch (\Throwable $e) {
                Log::warning('credit:settle-from-wallet: a customer could not be settled', ['customer_id' => $customer->id, 'error' => $e->getMessage()]);
            }
        }

        $this->info(sprintf('Settled %d account(s); MVR %s moved from wallets.', $settled, number_format($movedLaar / 100, 2)));

        return self::SUCCESS;
    }
}
