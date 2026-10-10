<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsEmailCopier;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsNotificationSettings;
use App\Domains\Orders\Events\OrderStatusChanged;
use App\Models\Order;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Support\ReceiptLink;
use Illuminate\Support\Facades\Log;

/**
 * When an online pickup or delivery order reaches completed or delivered, SMS the receipt link.
 * Idempotent per order via SmsService idempotency key.
 */
final class SendOnlineOrderCompletionReceiptSmsListener
{
    public bool $afterCommit = true;

    private const ONLINE_TYPES = ['online_pickup', 'delivery'];

    public function __construct(
        private readonly SmsService $sms,
        private readonly CustomerSmsMessageBuilder $messages,
    ) {}

    public function handle(OrderStatusChanged $event): void
    {
        // SMS off (to save cost) still sends the email copy (owner, 2026-10-06).
        $smsOn = SmsNotificationSettings::isEnabled(SmsNotificationSettings::COMPLETION_RECEIPT);
        if (!$smsOn && !SmsEmailCopier::wanted('customer_completion_receipt')) {
            return;
        }

        $status = $event->data->status;
        if (!in_array($status, ['completed', 'delivered'], true)) {
            return;
        }

        $order = Order::with('customer')->find($event->data->orderId);
        if ($order === null) {
            return;
        }

        if (!in_array($order->type, self::ONLINE_TYPES, true)) {
            return;
        }

        $phone = $order->customer?->phone;
        if (!$phone) {
            return;
        }

        // A delivery's "delivered" message carries the receipt (owner,
        // 2026-10-10: two texts at the door). This one goes only when that
        // message is off, or when the order was completed without it.
        if ($order->type === 'delivery' && $this->deliveredMessageCarriesIt($order, $status)) {
            return;
        }

        $link = ReceiptLink::forOrder($order, $phone);
        $fallback = 'Order #' . $order->order_number . ' complete. Receipt: ' . $link;
        $message = $this->messages->build(
            CustomerSmsMessageBuilder::SLUG_COMPLETION_RECEIPT,
            [
                'order_number' => (string) $order->order_number,
                'receipt_url' => $link,
            ],
            $fallback,
        );

        try {
            $this->sms->send(new SmsMessage(
                to: $phone,
                message: $message,
                type: 'customer_completion_receipt',
                customerId: $order->customer_id,
                referenceType: 'order',
                referenceId: (string) $order->id,
                idempotencyKey: 'order:complete:receipt:' . $order->id,
                emailOnly: !$smsOn,
            ));
        } catch (\Throwable $e) {
            Log::error('SendOnlineOrderCompletionReceiptSmsListener: SMS failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * At "delivered", the delivered message goes when it is on in any
     * channel, with the receipt in it. At "completed", it went if its log
     * row exists (the rider tapped Delivered first).
     */
    private function deliveredMessageCarriesIt(Order $order, string $status): bool
    {
        if ($status === 'delivered') {
            return SiteSetting::get('sms_customer_delivered_enabled', 'true') === 'true'
                || SmsEmailCopier::wanted('customer_order_delivered');
        }

        return SmsLog::query()->where('idempotency_key', 'order:delivered:' . $order->id)->exists();
    }
}
