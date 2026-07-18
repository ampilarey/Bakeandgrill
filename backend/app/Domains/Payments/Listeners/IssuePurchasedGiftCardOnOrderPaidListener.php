<?php

declare(strict_types=1);

namespace App\Domains\Payments\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Payments\Services\GiftCardEmailDelivery;
use App\Domains\Payments\Services\GiftCardIssueService;
use App\Domains\Payments\Services\GiftCardSmsDelivery;
use App\Models\GiftCardPurchase;
use App\Models\Order;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * After a gift-card purchase order is paid, issue the card and deliver the code.
 * Idempotent via gift_card_purchases.gift_card_id.
 */
final class IssuePurchasedGiftCardOnOrderPaidListener
{
    public bool $afterCommit = true;

    public function __construct(
        private readonly GiftCardIssueService $issuer,
        private readonly GiftCardSmsDelivery $sms,
        private readonly GiftCardEmailDelivery $email,
    ) {}

    public function handle(OrderPaid $event): void
    {
        $order = Order::query()->find($event->data->orderId);
        if (!$order || $order->type !== 'gift_card') {
            return;
        }

        try {
            DB::transaction(function () use ($order): void {
                $purchase = GiftCardPurchase::query()
                    ->where('order_id', $order->id)
                    ->lockForUpdate()
                    ->first();

                if (!$purchase || $purchase->gift_card_id) {
                    return;
                }

                $issued = $this->issuer->issue([
                    'amount' => (float) $purchase->amount,
                    'purchased_by_customer_id' => $purchase->purchaser_customer_id,
                    'issued_to_customer_id' => $purchase->purchaser_customer_id,
                ]);

                $purchase->update(['gift_card_id' => $issued['card']->id]);

                $note = $purchase->personal_note;

                if ($purchase->recipient_phone) {
                    $sent = $this->sms->send(
                        $issued['card'],
                        $issued['plain'],
                        $purchase->recipient_phone,
                        $note,
                        $purchase->purchaser_customer_id,
                    );
                    if (!$sent['ok']) {
                        Log::warning('Gift card purchase SMS failed', [
                            'order_id' => $order->id,
                            'error' => $sent['error'],
                        ]);
                    }
                }

                if ($purchase->recipient_email) {
                    $sent = $this->email->send(
                        $issued['card'],
                        $issued['plain'],
                        $purchase->recipient_email,
                        $note,
                    );
                    if (!$sent['ok']) {
                        Log::warning('Gift card purchase email failed', [
                            'order_id' => $order->id,
                            'error' => $sent['error'],
                        ]);
                    }
                }

                if ($order->status !== 'completed') {
                    $order->update([
                        'status' => 'completed',
                        'payment_status' => 'paid',
                        'completed_at' => now(),
                        'paid_at' => $order->paid_at ?? now(),
                    ]);
                }
            });
        } catch (\Throwable $e) {
            Log::error('IssuePurchasedGiftCardOnOrderPaidListener failed', [
                'order_id' => $event->data->orderId,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
