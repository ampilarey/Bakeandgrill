<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Orders\Events\OrderStatusChanged;
use App\Models\Order;
use App\Models\Receipt;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * When an online pickup or delivery order reaches completed or delivered, SMS the receipt link.
 * Idempotent per order via SmsService idempotency key.
 */
final class SendOnlineOrderCompletionReceiptSmsListener
{
    public bool $afterCommit = true;

    private const ONLINE_TYPES = ['online_pickup', 'delivery'];

    public function __construct(private readonly SmsService $sms) {}

    public function handle(OrderStatusChanged $event): void
    {
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

        $receipt = Receipt::firstOrNew(['order_id' => $order->id]);
        if (!$receipt->exists) {
            $receipt->token = Str::random(48);
        }
        $receipt->customer_id = $order->customer_id;
        $receipt->fill([
            'channel' => 'sms',
            'recipient' => $phone,
        ]);
        $receipt->save();

        $link = rtrim(config('app.url'), '/') . '/receipts/' . $receipt->token;
        $message = 'Order #' . $order->order_number . ' complete. Receipt: ' . $link;

        try {
            $this->sms->send(new SmsMessage(
                to: $phone,
                message: $message,
                type: 'transactional',
                customerId: $order->customer_id,
                referenceType: 'order',
                referenceId: (string) $order->id,
                idempotencyKey: 'order:complete:receipt:' . $order->id,
            ));
        } catch (\Throwable $e) {
            Log::error('SendOnlineOrderCompletionReceiptSmsListener: SMS failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
