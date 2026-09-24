<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Trade\Services\TradeCreditExposureService;
use App\Domains\Trade\Services\TradeSmsNotifier;
use App\Models\Invoice;
use App\Models\TradeAccount;
use App\Models\TradeDelivery;
use Illuminate\Console\Command;

/**
 * Wholesale audit, 2026-09-26: each shop's billing cycle was stored and
 * never read. Daily: a shop with reconciled, uninvoiced deliveries whose
 * cycle has come round since its last invoice is listed in one owner text,
 * once per cycle.
 */
class RemindTradeBilling extends Command
{
    protected $signature = 'trade:billing-reminder';

    protected $description = 'Text the owners which shops are due an invoice under their billing cycle';

    public function handle(TradeSmsNotifier $sms, TradeCreditExposureService $exposure): int
    {
        $today = now()->startOfDay();
        $due = [];
        $stampIds = [];

        $accounts = TradeAccount::query()
            ->where('is_active', true)
            ->whereHas('deliveries', fn ($q) => $q->where('status', TradeDelivery::STATUS_RECONCILED))
            ->orderBy('shop_name')
            ->get();

        foreach ($accounts as $account) {
            $cycleDays = $account->billingCycleDays();
            $lastInvoice = Invoice::query()
                ->where('trade_account_id', $account->id)
                ->where('type', 'sale')
                ->whereNotIn('status', ['void', 'cancelled', 'draft'])
                ->max('issue_date');
            if ($cycleDays > 0 && $lastInvoice !== null && $today->lt(\Illuminate\Support\Carbon::parse($lastInvoice)->addDays($cycleDays))) {
                continue;
            }
            $repeatAfter = max(1, $cycleDays);
            if ($account->billing_reminded_at !== null && $today->lt($account->billing_reminded_at->copy()->startOfDay()->addDays($repeatAfter))) {
                continue;
            }

            $invoiceable = 0;
            $deliveries = TradeDelivery::query()
                ->where('trade_account_id', $account->id)
                ->where('status', TradeDelivery::STATUS_RECONCILED)
                ->with('lines')
                ->get();
            foreach ($deliveries as $delivery) {
                foreach ($delivery->lines as $line) {
                    $line->setRelation('delivery', $delivery);
                    $left = max(0, $exposure->invoiceableQty($line, $account) - $exposure->allocatedQty($line->id));
                    $invoiceable += $left * (int) $line->unit_price_laar;
                }
            }
            if ($invoiceable <= 0) {
                continue;
            }

            $due[] = sprintf('%s MVR %s (%d deliver%s)', $account->shop_name, number_format($invoiceable / 100, 2, '.', ','), $deliveries->count(), $deliveries->count() === 1 ? 'y' : 'ies');
            $stampIds[] = $account->id;
        }

        if ($due === []) {
            $this->info('No shop is due an invoice today.');

            return self::SUCCESS;
        }

        $body = 'Wholesale billing due: ' . implode('; ', $due) . '. Raise them in Wholesale → Invoicing.';
        $sms->sendToOwners('owner_trade_billing_due', $body, 'trade_billing', $today->toDateString(), 'trade:billing:' . $today->toDateString() . ':' . implode(',', $stampIds));
        TradeAccount::whereIn('id', $stampIds)->update(['billing_reminded_at' => now()]);
        $this->info('Reminded owners about ' . count($stampIds) . ' shop(s).');

        return self::SUCCESS;
    }
}
