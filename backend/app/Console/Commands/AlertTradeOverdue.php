<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Trade\Services\TradeSmsNotifier;
use App\Models\Invoice;
use Illuminate\Console\Command;

/**
 * Wholesale audit, 2026-09-26: the owner got no text at all for overdue
 * wholesale money; the ageing report had to be opened by hand. Daily: a
 * shop whose invoice crosses 30 and then 60 days overdue is texted to the
 * owners once at each stage, all shops in one message.
 */
class AlertTradeOverdue extends Command
{
    public const STAGES = [30, 60];

    protected $signature = 'trade:alert-overdue';

    protected $description = 'Text the owners when a wholesale invoice crosses 30 and 60 days overdue';

    public function handle(TradeSmsNotifier $sms): int
    {
        $today = now()->startOfDay();
        $lines = [];
        $stamp = [];

        $invoices = Invoice::query()
            ->with('tradeAccount:id,shop_name')
            ->whereNotNull('trade_account_id')
            ->where('type', 'sale')
            ->whereIn('status', ['sent', 'overdue'])
            ->whereNotNull('due_date')
            ->whereRaw(Invoice::OPEN_BALANCE_SQL)
            ->where('overdue_alert_stage', '<', max(self::STAGES))
            ->orderBy('due_date')
            ->get();

        $byShop = [];
        foreach ($invoices as $invoice) {
            $due = $invoice->due_date?->copy()->startOfDay();
            if ($due === null || !$due->lt($today)) {
                continue;
            }
            $days = (int) $due->diffInDays($today);
            $reached = 0;
            foreach (self::STAGES as $stage) {
                if ($days >= $stage) {
                    $reached = $stage;
                }
            }
            if ($reached === 0 || $reached <= (int) $invoice->overdue_alert_stage) {
                continue;
            }
            $shop = $invoice->tradeAccount?->shop_name ?? 'Shop';
            $byShop[$shop][] = sprintf('%s MVR %s %d days', $invoice->invoice_number, number_format($invoice->balanceDueLaar() / 100, 2, '.', ','), $days);
            $stamp[$invoice->id] = $reached;
        }

        if ($byShop === []) {
            $this->info('No wholesale invoice crossed 30 or 60 days overdue.');

            return self::SUCCESS;
        }

        foreach ($byShop as $shop => $items) {
            $lines[] = $shop . ': ' . implode(', ', array_slice($items, 0, 4)) . (count($items) > 4 ? ' +' . (count($items) - 4) . ' more' : '');
        }
        $body = 'Wholesale overdue: ' . implode('; ', $lines) . '. Chase them or write it off in Wholesale → Shops → Statement.';

        $key = implode(',', array_map(fn ($id, $stage) => $id . '@' . $stage, array_keys($stamp), $stamp));
        $sms->sendToOwners('owner_trade_overdue', $body, 'trade_overdue', $today->toDateString(), 'trade:overdue:' . $today->toDateString() . ':' . $key);

        foreach ($stamp as $id => $stage) {
            Invoice::whereKey($id)->update(['overdue_alert_stage' => $stage]);
        }
        $this->info('Alerted owners about ' . count($stamp) . ' overdue wholesale invoice(s).');

        return self::SUCCESS;
    }
}
