<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\LoyaltyAccount;
use App\Services\LoyaltySettingsService;
use Illuminate\Console\Command;

class SendTierMilestoneSms extends Command
{
    protected $signature = 'marketing:send-tier-milestones {--within=50 : Points within next tier to notify}';

    protected $description = 'SMS customers who are close to their next loyalty tier';

    public function handle(LoyaltySettingsService $settings, SmsService $sms): int
    {
        $within = max(10, (int) $this->option('within'));
        $sent = 0;
        $today = now()->toDateString();

        if (!$settings->tiersEnabled()) {
            $this->info('Loyalty tiers disabled.');

            return self::SUCCESS;
        }

        LoyaltyAccount::query()
            ->with('customer')
            ->whereHas('customer', fn ($q) => $q->where('sms_opt_out', false)->whereNotNull('phone')->where('phone', '!=', ''))
            ->orderBy('id')
            ->chunkById(100, function ($accounts) use ($settings, $sms, $within, $today, &$sent): void {
                foreach ($accounts as $account) {
                    $customer = $account->customer;
                    if ($customer === null) {
                        continue;
                    }

                    $progress = $settings->tierProgress((int) $account->lifetime_points, (string) $account->tier);
                    if ($progress === null || ($progress['at_max_tier'] ?? false) === true) {
                        continue;
                    }

                    $ptsLeft = (int) ($progress['points_to_next'] ?? 0);
                    if ($ptsLeft <= 0 || $ptsLeft > $within) {
                        continue;
                    }

                    $nextTier = (string) ($progress['next_tier_name'] ?? 'the next tier');
                    $message = "You're only {$ptsLeft} points away from {$nextTier} at Bake & Grill! Order today: " . config('app.url');

                    $sms->send(new SmsMessage(
                        to: (string) $customer->phone,
                        message: $message,
                        type: 'promotion',
                        customerId: $customer->id,
                        referenceType: 'tier_milestone',
                        referenceId: (string) $account->id,
                        idempotencyKey: "tier-milestone:{$customer->id}:{$today}",
                    ));

                    $sent++;
                }
            });

        $this->info("Sent {$sent} tier milestone SMS.");

        return self::SUCCESS;
    }
}
