<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Orders\Events\OrderStatusChanged;
use App\Models\Order;
use App\Models\SiteSetting;
use App\Support\OrderTrackingUrl;
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
final class SendCustomerOrderStatusSmsListener
{
    public bool $afterCommit = true;

    public function __construct(
        private readonly SmsService $sms,
        private readonly CustomerSmsMessageBuilder $messages,
    ) {}

    /**
     * Lifecycle SMSes (preparing / ready / on-the-way) only make sense
     * for customers who aren't physically at the counter. For POS
     * dine-in / takeaway the customer is in the room — pinging their
     * phone every KDS bump is just noise (and caused the cashier
     * complaint that "POS sends 2 SMS per ticket"). Restrict to the
     * two online types so the lifecycle SMS only fires where it's
     * actually useful.
     */
    private const NOTIFIABLE_TYPES = ['online_pickup', 'delivery'];

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

        // Skip POS dine-in / takeaway — see NOTIFIABLE_TYPES doc above.
        if (!in_array($order->type, self::NOTIFIABLE_TYPES, true)) {
            return;
        }

        $phone = $order->customer?->phone;
        if (!$phone) {
            return;
        }

        $trackingUrl = OrderTrackingUrl::for($order);

        $orderNum = $order->order_number ?? "#{$order->id}";

        [$slug, $fallback, $idempotencyKey] = match ($status) {
            'in_progress' => [
                CustomerSmsMessageBuilder::SLUG_ORDER_PREPARING,
                "#{$orderNum} is being prepared. We'll text when ready. {$trackingUrl}",
                "order:preparing:{$order->id}",
            ],
            'ready' => $order->type === 'delivery'
                ? [
                    CustomerSmsMessageBuilder::SLUG_ORDER_READY_DELIVERY,
                    "#{$orderNum} is packed. Rider will pick up soon. {$trackingUrl}",
                    "order:ready:{$order->id}",
                ]
                : [
                    CustomerSmsMessageBuilder::SLUG_ORDER_READY_PICKUP,
                    "#{$orderNum} is ready for pickup. {$trackingUrl}",
                    "order:ready:{$order->id}",
                ],
            'on_the_way' => [
                CustomerSmsMessageBuilder::SLUG_ORDER_ON_THE_WAY,
                "#{$orderNum} is on the way. {$trackingUrl}",
                "order:on_the_way:{$order->id}",
            ],
        };

        $message = $this->messages->build(
            $slug,
            [
                'order_number' => (string) $orderNum,
                'tracking_url' => $trackingUrl,
            ],
            $fallback,
        );

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
