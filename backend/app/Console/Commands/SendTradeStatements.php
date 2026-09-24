<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Trade\Services\TradeSmsNotifier;
use App\Models\Invoice;
use App\Models\TradeAccount;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Wholesale audit, 2026-09-26: a shop was never sent a statement. On the
 * first of the month every shop with a balance (owed or in credit) gets one
 * text: what they owe, what is overdue, and the link to their statement.
 */
class SendTradeStatements extends Command
{
    protected $signature = 'trade:send-statements {--month= : Statement month (Y-m), defaults to last month}';

    protected $description = 'Text every wholesale shop with a balance its monthly statement';

    public function handle(TradeSmsNotifier $sms): int
    {
        $month = $this->option('month')
            ? Carbon::createFromFormat('Y-m', (string) $this->option('month'))->startOfMonth()
            : now()->subMonthNoOverflow()->startOfMonth();
        $label = $month->format('F Y');
        $today = now()->startOfDay();
        $sent = 0;

        $accounts = TradeAccount::query()
            ->with('customer:id,name,phone,credit_balance_laar,sms_opt_out')
            ->whereHas('customer', fn ($q) => $q->where('credit_balance_laar', '!=', 0))
            ->orderBy('shop_name')
            ->get();

        foreach ($accounts as $account) {
            $balance = (int) ($account->customer?->credit_balance_laar ?? 0);
            $owed = max(0, $balance);
            $inCredit = max(0, -$balance);

            $overdue = 0;
            if ($owed > 0) {
                $overdue = Invoice::query()
                    ->where('trade_account_id', $account->id)
                    ->where('type', 'sale')
                    ->whereIn('status', ['sent', 'overdue'])
                    ->whereNotNull('due_date')
                    ->where('due_date', '<', $today->toDateString())
                    ->whereRaw(Invoice::OPEN_BALANCE_SQL)
                    ->get()
                    ->sum(fn (Invoice $i) => $i->balanceDueLaar());
            }

            if ($sms->sendStatementToShop($account, $label, $owed, (int) $overdue, $inCredit, 'trade:statement:' . $account->id . ':' . $month->format('Y-m'))) {
                $sent++;
            }
        }

        $this->info("Sent {$sent} wholesale statement(s) for {$label}.");

        return self::SUCCESS;
    }
}
