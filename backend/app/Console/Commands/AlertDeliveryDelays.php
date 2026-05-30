<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Operations\Services\OpsAlertsService;
use App\Models\SiteSetting;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class AlertDeliveryDelays extends Command
{
    protected $signature = 'ops:alert-delivery-delays {--minutes=15 : Minutes past estimated ready before alerting}';

    protected $description = 'Log delivery orders past estimated ready time; optionally SMS owner';

    public function handle(SmsService $sms, OpsAlertsService $ops): int
    {
        $grace = max(5, (int) $this->option('minutes'));

        $delayed = $ops->delayedDeliveryQuery($grace)
            ->orderBy('delivery_eta_at')
            ->limit(50)
            ->get(['id', 'order_number', 'status', 'delivery_eta_at', 'fired_at', 'estimated_wait_minutes']);

        if ($delayed->isEmpty()) {
            $this->info('No delayed delivery orders.');

            return self::SUCCESS;
        }

        foreach ($delayed as $order) {
            $msg = "Delivery delay: order #{$order->order_number} ({$order->status}) past estimated ready";
            Log::warning($msg, [
                'order_id' => $order->id,
                'delivery_eta_at' => $order->delivery_eta_at,
                'fired_at' => $order->fired_at,
                'estimated_wait_minutes' => $order->estimated_wait_minutes,
            ]);
            $this->line($msg);
        }

        if (filter_var(SiteSetting::get('ops_delivery_delay_alert_sms', '0'), FILTER_VALIDATE_BOOLEAN)) {
            $phone = trim((string) SiteSetting::get('business_phone', ''));
            if ($phone !== '') {
                $count = $delayed->count();
                $sms->send(new SmsMessage(
                    to: $phone,
                    message: "Bake & Grill: {$count} delivery order(s) are past ETA. Check admin dashboard.",
                    type: 'system',
                    idempotencyKey: 'delivery-delay-alert:' . now()->format('Y-m-d-H'),
                ));
            }
        }

        return self::SUCCESS;
    }
}
