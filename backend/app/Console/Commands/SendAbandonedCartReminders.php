<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Marketing\Services\MarketingAutomationService;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\AbandonedCart;
use Illuminate\Console\Command;

class SendAbandonedCartReminders extends Command
{
    protected $signature = 'marketing:send-abandoned-cart-reminders';

    protected $description = 'Send one recovery SMS per eligible abandoned cart snapshot';

    public function handle(MarketingAutomationService $marketing, SmsService $sms): int
    {
        $settings = $marketing->settings();
        if (!$settings['abandoned_cart_enabled']) {
            $this->info('Abandoned cart SMS disabled.');

            return self::SUCCESS;
        }

        $eligibleBefore = $marketing->abandonedCartEligibleBefore();
        $sent = 0;

        AbandonedCart::query()
            ->with('customer:id,name,phone,sms_opt_out')
            ->whereNull('reminded_at')
            ->where('snapshot_at', '<=', $eligibleBefore)
            ->where(function ($q): void {
                $q->whereNotNull('phone')->where('phone', '!=', '')
                    ->orWhereHas('customer', fn ($c) => $c
                        ->where('sms_opt_out', false)
                        ->whereNotNull('phone')
                        ->where('phone', '!=', ''));
            })
            ->orderBy('id')
            ->chunkById(50, function ($carts) use ($sms, $marketing, &$sent): void {
                foreach ($carts as $cart) {
                    $customer = $cart->customer;
                    if ($customer?->sms_opt_out) {
                        continue;
                    }

                    $to = (string) ($cart->phone ?: $customer?->phone ?: '');
                    if ($to === '') {
                        continue;
                    }

                    $url = $marketing->orderUrl() . '/checkout';
                    $message = $marketing->interpolate($marketing->settings()['abandoned_cart_sms_template'], [
                        'url' => $url,
                        'name' => $customer?->name ?: 'there',
                    ]);

                    $sms->send(new SmsMessage(
                        to: $to,
                        message: $message,
                        type: 'promotion',
                        customerId: $customer?->id,
                        referenceType: 'abandoned_cart',
                        referenceId: (string) $cart->id,
                        idempotencyKey: "abandoned-cart:{$cart->id}",
                    ));

                    $cart->update(['reminded_at' => now()]);
                    $sent++;
                }
            });

        $this->info("Sent {$sent} abandoned cart reminder(s).");

        return self::SUCCESS;
    }
}
