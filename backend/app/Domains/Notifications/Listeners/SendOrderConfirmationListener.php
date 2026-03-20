<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Listeners;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Orders\Events\OrderCreated;
use App\Mail\OrderConfirmationMail;
use App\Models\Order;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class SendOrderConfirmationListener implements ShouldQueue
{
    public bool   $afterCommit = true;
    public string $queue       = 'default';
    public int    $tries       = 3;
    public int    $backoff     = 5;

    public function __construct(private SmsService $sms) {}

    public function handle(OrderCreated $event): void
    {
        $data  = $event->data;
        $order = Order::with(['items.item', 'customer'])->find($data->orderId);

        if (! $order) {
            return;
        }

        // Resolve recipient — authenticated customer or guest
        $phone = $order->customer?->phone ?? $order->guest_phone;
        $email = $order->customer?->email ?? $order->guest_email;
        $name  = $order->customer?->name  ?? $order->guest_name ?? 'Customer';

        // Staff/POS orders with no linked customer and no guest phone — skip
        if (! $phone) {
            return;
        }

        // Build tracking URL — guests need the token to access the status page
        $base = rtrim(config('app.url'), '/') . '/order/status/' . $order->id;
        $url  = $order->guest_token
            ? $base . '?guest_token=' . $order->guest_token
            : $base;

        // SMS — idempotency key prevents duplicate sends on queue retry
        try {
            $this->sms->send(new SmsMessage(
                to:             $phone,
                message:        "Bake & Grill: Order #{$order->order_number} confirmed! Track your order: {$url}",
                type:           'transactional',
                customerId:     $data->customerId,
                referenceType:  'order',
                referenceId:    (string) $order->id,
                idempotencyKey: 'order:confirm:' . $order->id,
            ));
        } catch (\Throwable $e) {
            Log::error('SendOrderConfirmationListener: SMS failed', [
                'order_id' => $order->id,
                'error'    => $e->getMessage(),
            ]);
        }

        // Email — optional, failure does not affect SMS
        if ($email) {
            try {
                Mail::to($email)->send(new OrderConfirmationMail($order, $url, $name));
            } catch (\Throwable $e) {
                Log::error('SendOrderConfirmationListener: email failed', [
                    'order_id' => $order->id,
                    'error'    => $e->getMessage(),
                ]);
            }
        }
    }
}
