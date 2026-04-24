<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Orders\Events\OrderStatusChanged;
use App\Models\Order;
use App\Models\SiteSetting;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;

/**
 * Sends the customer an SMS at key order lifecycle milestones:
 *   in_progress  → kitchen has started preparing
 *   ready        → order is ready for pickup / packed for delivery
 *   on_the_way   → rider is heading to the customer
 *
 * Each notification type can be toggled on/off independently via
 * Admin → Settings → Notifications.
 *
 * Only fires for orders that have a linked customer with a phone number.
 * Idempotent: SmsService deduplicates via idempotency key.
 */
final class SendCustomerOrderStatusSmsListener implements ShouldQueue
{
    public bool $afterCommit = true;

    public string $queue = 'default';

    public int $tries = 3;

    public int $backoff = 5;

    public function __construct(private readonly SmsService $sms) {}

    public function handle(OrderStatusChanged $event): void
    {
        $status = $event->data->status;

        // Only handle statuses we care about
        if (!in_array($status, ['in_progress', 'ready', 'on_the_way'], true)) {
            return;
        }

        // Check admin toggle — default true so notifications fire even before first admin save
        $settingKey = match ($status) {
            'in_progress' => 'sms_customer_preparing_enabled',
            'ready' => 'sms_customer_ready_enabled',
            'on_the_way' => 'sms_customer_on_the_way_enabled',
        };

        if (SiteSetting::get($settingKey, 'true') !== 'true') {
            return;
        }

        $order = Order::with('customer')->find($event->data->orderId);
        if ($order === null) {
            return;
        }

        $phone = $order->customer?->phone;
        if (!$phone) {
            return;
        }

        $trackingUrl = rtrim(config('app.url'), '/') . '/order/orders/' . $order->id
            . '?tok=' . $order->tracking_token;

        $orderNum = $order->order_number ?? "#{$order->id}";

        [$message, $idempotencyKey] = match ($status) {
            'in_progress' => [
                "Bake & Grill: Your order {$orderNum} is now being prepared! 🍳 We'll let you know when it's ready. Track: {$trackingUrl}",
                "order:preparing:{$order->id}",
            ],
            'ready' => $order->type === 'delivery'
                ? [
                    "Bake & Grill: Your order {$orderNum} is packed and ready! 🎉 A rider will pick it up shortly. Track: {$trackingUrl}",
                    "order:ready:{$order->id}",
                ]
                : [
                    "Bake & Grill: Your order {$orderNum} is ready for pickup! 🎉 Come collect it from our counter. Track: {$trackingUrl}",
                    "order:ready:{$order->id}",
                ],
            'on_the_way' => [
                "Bake & Grill: Your order {$orderNum} is on its way! 🛵 Our rider is heading to you. Track: {$trackingUrl}",
                "order:on_the_way:{$order->id}",
            ],
        };

        try {
            $this->sms->send(new SmsMessage(
                to: $phone,
                message: $message,
                type: 'transactional',
                customerId: $order->customer_id,
                referenceType: 'order',
                referenceId: (string) $order->id,
                idempotencyKey: $idempotencyKey,
            ));
        } catch (\Throwable $e) {
            Log::error('SendCustomerOrderStatusSmsListener: SMS failed', [
                'order_id' => $order->id,
                'status' => $status,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
