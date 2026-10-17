<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Loyalty\Services\PointsCalculator;
use App\Domains\Loyalty\Support\ExpiringPoints;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Models\Customer;
use App\Models\LoyaltyLedger;
use App\Services\LoyaltySettingsService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Tell customers a month ahead that points are about to expire (iruali import
 * plan, feature 13): once per batch of points. Row "Points about to expire";
 * an offer, so the customer's Offers and news choice applies.
 */
class WarnExpiringLoyaltyPoints extends Command
{
    public const TYPE = 'customer_points_expiring';

    protected $signature = 'loyalty:warn-expiring';

    protected $description = 'Tell customers whose points expire within 30 days, once per batch';

    public function handle(LoyaltySettingsService $settings, SmsService $sms, PointsCalculator $calculator): int
    {
        if ($settings->pointsExpiryDays() <= 0) {
            $this->info('Points do not expire; nothing to warn about.');

            return self::SUCCESS;
        }
        if (!AlertSwitch::isOn(self::TYPE)) {
            $this->line('The "points about to expire" message is off.');

            return self::SUCCESS;
        }

        $due = ExpiringPoints::entries(null, ExpiringPoints::WARN_DAYS)->whereNull('expiry_warned_at')->groupBy('customer_id');
        $sent = 0;
        foreach ($due as $customerId => $entries) {
            $customer = Customer::query()->find($customerId);
            $summary = ExpiringPoints::summarise((int) $customerId, $entries);
            if ($customer === null || $summary === null || blank($customer->phone)) {
                LoyaltyLedger::query()->whereIn('id', $entries->pluck('id'))->update(['expiry_warned_at' => now()]);

                continue;
            }
            $worth = number_format($calculator->discountLaarForPoints($summary['points']) / 100, 2);
            $message = 'Bake & Grill: ' . number_format($summary['points']) . ' of your points (worth MVR ' . $worth . ') expire on '
                . $summary['date']->format('j M') . '. Use them on your next order: ' . rtrim((string) config('app.url'), '/') . '/order/menu';
            try {
                $sms->send(new SmsMessage(
                    to: (string) $customer->phone,
                    message: $message,
                    type: self::TYPE,
                    customerId: $customer->id,
                    referenceType: 'loyalty_expiry',
                    referenceId: $summary['date']->toDateString(),
                    idempotencyKey: 'points-expiring:' . $customer->id . ':' . $summary['date']->toDateString(),
                ));
                $sent++;
            } catch (\Throwable $e) {
                Log::warning('Points expiry warning could not be sent', ['customer_id' => $customer->id, 'error' => $e->getMessage()]);

                continue;
            }
            LoyaltyLedger::query()->whereIn('id', $entries->pluck('id'))->update(['expiry_warned_at' => now()]);
        }
        $this->info("Told {$sent} customer(s) about points expiring within " . ExpiringPoints::WARN_DAYS . ' days.');

        return self::SUCCESS;
    }
}
