<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Marketing\Services\MarketingAutomationService;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Customer;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class SendBirthdayOffers extends Command
{
    protected $signature = 'marketing:send-birthday-offers {--date= : Process as of this date (Y-m-d)}';

    protected $description = 'Credit birthday loyalty bonus and send SMS to customers with DOB today';

    public function handle(
        MarketingAutomationService $marketing,
        LoyaltyLedgerService $loyalty,
        SmsService $sms,
    ): int {
        $settings = $marketing->settings();
        if (!$settings['birthday_enabled']) {
            $this->info('Birthday offers disabled.');

            return self::SUCCESS;
        }

        $today = $this->option('date')
            ? Carbon::parse((string) $this->option('date'))
            : now();

        $month = (int) $today->format('m');
        $day = (int) $today->format('d');
        $year = (int) $today->format('Y');
        $points = $settings['birthday_points'];
        $sent = 0;

        Customer::query()
            ->whereNotNull('date_of_birth')
            ->where('sms_opt_out', false)
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->whereMonth('date_of_birth', $month)
            ->whereDay('date_of_birth', $day)
            ->orderBy('id')
            ->chunkById(100, function ($customers) use ($loyalty, $sms, $marketing, $points, $year, &$sent): void {
                foreach ($customers as $customer) {
                    $idempotency = "birthday:{$customer->id}:{$year}";

                    $loyalty->creditBonus(
                        $customer,
                        $points,
                        'Birthday bonus',
                        $idempotency,
                    );

                    $message = $marketing->interpolate($marketing->settings()['birthday_sms_template'], [
                        'points' => (string) $points,
                        'url' => $marketing->orderUrl(),
                        'name' => $customer->name ?: 'there',
                    ]);

                    $sms->send(new SmsMessage(
                        to: (string) $customer->phone,
                        message: $message,
                        type: 'marketing_birthday',
                        customerId: $customer->id,
                        referenceType: 'birthday_offer',
                        referenceId: (string) $customer->id,
                        idempotencyKey: "birthday-sms:{$customer->id}:{$year}",
                    ));

                    $sent++;
                }
            });

        $this->info("Processed {$sent} birthday offer(s).");

        return self::SUCCESS;
    }
}
