<?php

declare(strict_types=1);

namespace App\Domains\Sms\Services;

use App\Domains\Sms\Jobs\SendStaffNotificationJob;
use App\Models\Order;
use App\Models\SmsTemplate;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class StaffNotificationDispatcher
{
    public function __construct(
        private readonly StaffNotificationRoutingService $routing,
        private readonly SmsTemplateRenderer $templateRenderer,
    ) {}

    /**
     * Event types → SmsTemplate slugs mapping.
     */
    private const EVENT_TEMPLATE_MAP = [
        'new_order' => 'order_new',
        'order_confirmed' => 'order_new',
        'order_ready' => 'order_ready',
        'order_out_for_delivery' => 'order_out_for_delivery',
        'no_staff_found' => 'no_staff_found',
    ];

    /**
     * SiteSetting keys for enabling/disabling each event.
     */
    private const EVENT_SETTING_MAP = [
        'new_order' => 'staff_sms_new_order_enabled',
        'order_confirmed' => 'staff_sms_order_confirmed_enabled',
        'order_ready' => 'staff_sms_order_ready_enabled',
        'order_out_for_delivery' => 'staff_sms_order_out_for_delivery_enabled',
        'no_staff_found' => 'staff_sms_no_staff_found_enabled',
    ];

    public function dispatch(Order $order, string $eventType, ?Carbon $at = null): void
    {
        $at = $at ?? Carbon::now();

        // Check if this event type is enabled
        $settingKey = self::EVENT_SETTING_MAP[$eventType] ?? null;
        if ($settingKey && ! $this->isEventEnabled($settingKey)) {
            Log::info('StaffNotificationDispatcher: event disabled', [
                'event_type' => $eventType,
                'order_id' => $order->id,
            ]);

            return;
        }

        // Resolve recipients
        $recipients = $this->routing->resolve($order, $eventType, $at);

        if ($recipients->isEmpty()) {
            Log::warning('StaffNotificationDispatcher: no recipients found', [
                'order_id' => $order->id,
                'event_type' => $eventType,
            ]);

            return;
        }

        // Build the message
        $message = $this->buildMessage($eventType, $order);

        // Dispatch a job for each recipient
        foreach ($recipients as $recipient) {
            SendStaffNotificationJob::dispatch(
                orderId: $order->id,
                eventType: $eventType,
                phone: $recipient['phone'],
                message: $message,
                recipientType: $recipient['recipient_type'],
                recipientId: $recipient['recipient_id'],
                fallbackUsed: $recipient['fallback_used'],
            );
        }
    }

    private function buildMessage(string $eventType, Order $order): string
    {
        $templateSlug = self::EVENT_TEMPLATE_MAP[$eventType] ?? null;

        if (! $templateSlug) {
            return "Order #{$order->order_number} requires attention.";
        }

        $template = SmsTemplate::where('slug', $templateSlug)->first();

        if (! $template) {
            return "Order #{$order->order_number} - {$eventType}.";
        }

        $orderTypeLabel = match ($order->type) {
            'dine_in' => 'dine-in',
            'takeaway' => 'takeaway',
            'online_pickup' => 'online pickup',
            'delivery' => 'delivery',
            default => $order->type,
        };

        $itemCount = $order->relationLoaded('items')
            ? $order->items->sum('quantity')
            : $order->items()->sum('quantity');

        // Load customer phone if not already loaded
        $customerPhone = $order->delivery_contact_phone
            ?? ($order->relationLoaded('customer') ? optional($order->customer)->phone : optional($order->customer()->first())->phone)
            ?? 'N/A';

        $total = 'MVR '.number_format((float) ($order->total ?? 0), 2);

        return $this->templateRenderer->render($template, [
            'order_number' => $order->order_number,
            'order_type' => $orderTypeLabel,
            'item_count' => $itemCount,
            'customer_phone' => $customerPhone,
            'total' => $total,
        ]);
    }

    private function isEventEnabled(string $settingKey): bool
    {
        try {
            $value = \App\Models\SiteSetting::get($settingKey, '1');

            return in_array($value, ['1', 'true', 'on', true], true);
        } catch (\Throwable) {
            return true;
        }
    }
}
