<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Credit\Services\CreditPaymentService;
use App\Models\Customer;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Owner, 2026-10-21: on the 1st, every customer who owes money on their
 * credit account gets one text with what they owe, what is overdue and the
 * link to their statement page, where they can pay the lot online. A
 * customer who turned reminder texts off is left alone. Wholesale shops get
 * their own (trade:send-statements).
 */
class SendCreditStatements extends Command
{
    protected $signature = 'credit:send-statements {--month= : Statement month (Y-m), defaults to last month}';

    protected $description = 'Text every customer with a credit balance their monthly statement';

    public function handle(CreditPaymentService $credit): int
    {
        $month = $this->option('month')
            ? Carbon::createFromFormat('Y-m', (string) $this->option('month'))->startOfMonth()
            : now()->subMonthNoOverflow()->startOfMonth();
        $label = $month->format('F Y');
        $sent = 0;

        $customers = Customer::query()
            ->where('credit_balance_laar', '>', 0)
            ->whereDoesntHave('tradeAccount')
            ->orderBy('name')
            ->get();

        foreach ($customers as $customer) {
            if ($credit->sendStatement($customer, $label)) {
                $sent++;
            }
        }

        $this->info("Sent {$sent} credit statement(s) for {$label}.");

        return self::SUCCESS;
    }
}
