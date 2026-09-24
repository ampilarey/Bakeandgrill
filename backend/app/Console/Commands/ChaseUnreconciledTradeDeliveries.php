<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Trade\Services\TradeSmsNotifier;
use App\Models\SiteSetting;
use App\Models\TradeDelivery;
use Illuminate\Console\Command;

/**
 * Wholesale audit, 2026-09-26: stock sitting at a shop was chased by
 * nobody. Daily: a shop that has not reported sales on a delivery past its
 * expected return (or older than the nudge threshold) is texted once; a
 * delivery still unreconciled after the alert threshold is texted to the
 * owners once. Both thresholds are settings.
 */
class ChaseUnreconciledTradeDeliveries extends Command
{
    public const SETTING_NUDGE_DAYS = 'trade_unreconciled_nudge_days';

    public const SETTING_ALERT_DAYS = 'trade_unreconciled_alert_days';

    public const DEFAULT_NUDGE_DAYS = 3;

    public const DEFAULT_ALERT_DAYS = 7;

    protected $signature = 'trade:chase-unreconciled';

    protected $description = 'Nudge shops to report sales and alert the owners about deliveries left unreconciled';

    public static function nudgeDays(): int
    {
        return max(0, min(60, (int) SiteSetting::get(self::SETTING_NUDGE_DAYS, (string) self::DEFAULT_NUDGE_DAYS)));
    }

    public static function alertDays(): int
    {
        return max(0, min(90, (int) SiteSetting::get(self::SETTING_ALERT_DAYS, (string) self::DEFAULT_ALERT_DAYS)));
    }

    public function handle(TradeSmsNotifier $sms): int
    {
        $now = now();
        $nudgeDays = self::nudgeDays();
        $alertDays = self::alertDays();
        $nudged = 0;

        if ($nudgeDays > 0) {
            $due = TradeDelivery::query()
                ->where('status', TradeDelivery::STATUS_DISPATCHED)
                ->whereNull('reported_at')
                ->whereNull('sales_nudged_at')
                ->where(function ($q) use ($now, $nudgeDays): void {
                    $q->where('expected_return_at', '<=', $now)
                        ->orWhere(fn ($qq) => $qq->whereNull('expected_return_at')->where('dispatched_at', '<=', $now->copy()->subDays($nudgeDays)));
                })
                ->with(['tradeAccount.customer', 'lines.item'])
                ->orderBy('dispatched_at')
                ->get();

            foreach ($due as $delivery) {
                try {
                    if ($sms->sendReportReminderToShop($delivery)) {
                        $nudged++;
                    }
                } catch (\Throwable $e) {
                    report($e);
                }
                $delivery->update(['sales_nudged_at' => $now]);
            }
        }

        $alerted = 0;
        if ($alertDays > 0) {
            $stale = TradeDelivery::query()
                ->where('status', TradeDelivery::STATUS_DISPATCHED)
                ->whereNull('unreconciled_alerted_at')
                ->where('dispatched_at', '<=', $now->copy()->subDays($alertDays))
                ->with(['tradeAccount:id,shop_name', 'lines'])
                ->orderBy('dispatched_at')
                ->get();

            if ($stale->isNotEmpty()) {
                $bits = $stale->take(6)->map(fn (TradeDelivery $d) => sprintf(
                    '%s at %s (%d days, MVR %s)',
                    $d->delivery_number,
                    $d->tradeAccount?->shop_name ?? 'shop',
                    (int) $d->dispatched_at?->diffInDays($now),
                    number_format($d->stampedValueLaar() / 100, 2, '.', ','),
                ))->all();
                $body = 'Wholesale stock not reconciled: ' . implode('; ', $bits)
                    . ($stale->count() > 6 ? ' +' . ($stale->count() - 6) . ' more' : '')
                    . '. Count the returns and reconcile in Wholesale → Deliveries.';
                $sms->sendToOwners('owner_trade_unreconciled', $body, 'trade_unreconciled', $now->toDateString(), 'trade:unreconciled:' . $now->toDateString() . ':' . $stale->pluck('id')->implode(','));
                TradeDelivery::whereIn('id', $stale->pluck('id'))->update(['unreconciled_alerted_at' => $now]);
                $alerted = $stale->count();
            }
        }

        $this->info("Nudged {$nudged} shop delivery(ies); alerted owners about {$alerted}.");

        return self::SUCCESS;
    }
}
