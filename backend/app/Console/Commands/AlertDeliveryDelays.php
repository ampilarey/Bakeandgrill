<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Operations\Services\OpsAlertsService;
use App\Support\OwnerPhones;
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
            ->get(['id', 'order_number', 'status', 'delivery_eta_at', 'fired_at', 'estimated_wait_minutes', 'delay_alerted_at']);

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

        // Each late delivery is reported once (owner, 2026-10-10: the same one
        // came again every hour until it arrived). A newly late order is
        // reported, naming it; the ones already reported are only counted.
        $fresh = $delayed->whereNull('delay_alerted_at')->values();
        if ($fresh->isEmpty()) {
            return self::SUCCESS;
        }

        // // One switch per channel on its row in Admin → Notifications (2026-10-10).
        if (AlertSwitch::isOn('owner_delivery_delays')) {
            $numbers = $fresh->take(3)->map(fn ($o) => '#' . $o->order_number)->implode(', ')
                . ($fresh->count() > 3 ? ' +' . ($fresh->count() - 3) . ' more' : '');
            $total = $delayed->count();
            $message = "Bake & Grill: delivery past ETA: {$numbers}."
                . ($total > $fresh->count() ? " {$total} late in all." : '')
                . ' Check Admin → Orders.';
            foreach (OwnerPhones::for('owner_delivery_delays') as $phone) {
                $sms->send(new SmsMessage(
                    to: $phone,
                    message: $message,
                    type: 'owner_delivery_delays',
                    idempotencyKey: 'delivery-delay-alert:' . $fresh->pluck('id')->implode(',') . ':' . $phone,
                ));
            }
            // Marked only once someone was told, so turning the alert on
            // later reports what is late at that moment.
            \App\Models\Order::query()->whereIn('id', $fresh->pluck('id'))->update(['delay_alerted_at' => now()]);
        }

        return self::SUCCESS;
    }
}
