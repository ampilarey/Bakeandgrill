<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Operations\Services\OpsAlertsService;
use App\Models\Order;
use App\Support\OwnerPhones;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Checkout audit, 2026-09-26: a paid pickup or dine-in order that nobody
 * starts — the kitchen screen asleep, a missed ping — had no alert; only
 * delivery did. Every five minutes: an online pickup or dine-in order that is
 * paid and still waiting N minutes after payment, or N minutes before its
 * pickup / arrival time (whichever is later), texts the business phone once.
 * Orders for another day are left to the day they are due.
 */
class AlertUnstartedOrders extends Command
{
    protected $signature = 'orders:alert-unstarted';

    protected $description = 'Text the owners about paid online orders the kitchen has not started';

    public function handle(SmsService $sms, OpsAlertsService $ops): int
    {
        $minutes = (int) ($ops->settings()['unstarted_order_alert_minutes'] ?? 0);
        if ($minutes <= 0) {
            $this->info('Unstarted-order alert is off.');

            return self::SUCCESS;
        }

        $now = now();
        $candidates = Order::query()
            ->whereIn('type', ['online_pickup', 'dine_in'])
            ->whereNotNull('customer_id')
            ->where('status', 'pending')
            ->whereNotNull('paid_at')
            ->whereNull('unstarted_alerted_at')
            ->where('paid_at', '<=', $now->copy()->subMinutes($minutes))
            ->where(function ($q): void {
                $q->whereNull('fulfil_date')->orWhereDate('fulfil_date', '<=', today());
            })
            ->orderBy('paid_at')
            ->limit(50)
            ->get();

        $due = $candidates->filter(function (Order $order) use ($minutes, $now): bool {
            if ($order->pickup_slot_at === null) {
                return true;
            }
            $startBy = Carbon::parse($order->pickup_slot_at)->subMinutes($minutes);

            return $now->gte($startBy);
        })->values();

        if ($due->isEmpty()) {
            $this->info('No paid online orders waiting to be started.');

            return self::SUCCESS;
        }

        $tz = config('app.timezone', 'Indian/Maldives');
        $bits = $due->take(6)->map(fn (Order $o) => sprintf(
            '#%s %s paid %s%s',
            $o->order_number ?? $o->id,
            $o->type === 'dine_in' ? 'dine-in' : 'pickup',
            $o->paid_at?->timezone($tz)->format('H:i') ?? '?',
            $o->pickup_slot_at ? ', due ' . Carbon::parse($o->pickup_slot_at)->timezone($tz)->format('H:i') : '',
        ))->all();
        $body = 'Paid online order not started: ' . implode('; ', $bits)
            . ($due->count() > 6 ? ' +' . ($due->count() - 6) . ' more' : '')
            . '. Check the kitchen screen.';

        foreach (OwnerPhones::for('owner_order_unstarted') as $phone) {
            $sms->send(new SmsMessage(
                to: $phone,
                message: $body,
                type: 'owner_order_unstarted',
                referenceType: 'order_unstarted',
                referenceId: $now->toDateString(),
                idempotencyKey: 'order-unstarted:' . $due->pluck('id')->implode(',') . ':' . $phone,
            ));
        }

        Order::whereIn('id', $due->pluck('id'))->update(['unstarted_alerted_at' => $now]);
        $this->info('Alerted about ' . $due->count() . ' unstarted order(s).');

        return self::SUCCESS;
    }
}
