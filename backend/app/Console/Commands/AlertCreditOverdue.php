<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Credit\Services\CreditLedgerService;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Customer;
use App\Models\Invoice;
use App\Support\OwnerPhones;
use Illuminate\Console\Command;

/**
 * Owner, 2026-10-21 (credit audit): nothing told the owner when a
 * customer's credit went overdue; only the customer was reminded. Daily: a
 * customer whose invoice crosses 30 and then 60 days overdue is texted to
 * the owners once at each stage, everyone in one message. Wholesale shops
 * have their own (trade:alert-overdue).
 */
class AlertCreditOverdue extends Command
{
    public const STAGES = [30, 60];

    public const TYPE = 'owner_credit_overdue';

    protected $signature = 'credit:alert-overdue';

    protected $description = 'Text the owners when a customer credit invoice crosses 30 and 60 days overdue';

    public function handle(CreditLedgerService $ledger, SmsService $sms): int
    {
        $today = now()->startOfDay();
        $lines = [];
        $stamp = [];

        $customers = Customer::query()
            ->where('credit_balance_laar', '>', 0)
            ->whereDoesntHave('tradeAccount')
            ->orderBy('name')
            ->get();

        foreach ($customers as $customer) {
            $items = [];
            foreach ($ledger->openCreditInvoices($customer) as $inv) {
                $due = $inv['due_date'] ?? null;
                if ($due === null) {
                    continue;
                }
                $dueDay = \Illuminate\Support\Carbon::parse($due)->startOfDay();
                if (!$dueDay->lt($today)) {
                    continue;
                }
                $days = (int) $dueDay->diffInDays($today);
                $reached = 0;
                foreach (self::STAGES as $stage) {
                    if ($days >= $stage) {
                        $reached = $stage;
                    }
                }
                $already = (int) (Invoice::query()->whereKey($inv['id'])->value('overdue_alert_stage') ?? 0);
                if ($reached === 0 || $reached <= $already) {
                    continue;
                }
                $items[] = sprintf('%s MVR %s %d days', $inv['invoice_number'], number_format($inv['balance_due_laar'] / 100, 2, '.', ','), $days);
                $stamp[(int) $inv['id']] = $reached;
            }
            if ($items !== []) {
                $lines[] = ($customer->name ?: $customer->phone) . ': ' . implode(', ', array_slice($items, 0, 3)) . (count($items) > 3 ? ' +' . (count($items) - 3) . ' more' : '');
            }
        }

        if ($lines === []) {
            $this->info('No customer credit invoice crossed 30 or 60 days overdue.');

            return self::SUCCESS;
        }

        $body = 'Credit overdue: ' . implode('; ', $lines) . '. Chase them in Customers → Accounts on credit.';
        $key = implode(',', array_map(fn ($id, $stage) => $id . '@' . $stage, array_keys($stamp), $stamp));
        foreach (OwnerPhones::for(self::TYPE) as $phone) {
            $sms->send(new SmsMessage(
                to: $phone,
                message: $body,
                type: self::TYPE,
                referenceType: 'credit_overdue',
                referenceId: $today->toDateString(),
                idempotencyKey: 'credit:overdue:' . $today->toDateString() . ':' . md5($key) . ':' . $phone,
            ));
        }

        foreach ($stamp as $id => $stage) {
            Invoice::whereKey($id)->update(['overdue_alert_stage' => $stage]);
        }
        $this->info('Alerted owners about ' . count($stamp) . ' overdue credit invoice(s).');

        return self::SUCCESS;
    }
}
