<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Deposits\Services\WalletTopUpService;
use App\Domains\Payments\Services\PendingBmlPaymentHealer;
use Illuminate\Console\Command;

/**
 * Ask the bank about card payments we still show as pending (owner,
 * 2026-10-05: a bill paid online stayed "unpaid" on the POS). Runs every
 * few minutes; see PendingBmlPaymentHealer for why. Wallet top-ups by card
 * (owner, 2026-10-21) are swept the same way, and the ones past their date
 * are closed.
 */
class ReconcilePendingBmlPayments extends Command
{
    protected $signature = 'payments:reconcile-pending-bml';

    protected $description = 'Settle BML card payments the bank confirmed but no webhook or return URL told us about';

    public function handle(PendingBmlPaymentHealer $healer, WalletTopUpService $topUps): int
    {
        $result = $healer->sweep();
        $this->info(sprintf('Checked %d order(s), settled %d.', $result['checked'], $result['settled']));

        $wallet = $topUps->sweep();
        $this->info(sprintf('Checked %d wallet top-up(s), settled %d, expired %d.', $wallet['checked'], $wallet['settled'], $wallet['expired']));

        return self::SUCCESS;
    }
}
