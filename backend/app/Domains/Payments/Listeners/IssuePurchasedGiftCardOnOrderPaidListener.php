<?php

declare(strict_types=1);

namespace App\Domains\Payments\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Payments\Services\GiftCardPurchaseFulfillmentService;
use App\Models\Order;
use Illuminate\Support\Facades\Log;

/**
 * After a gift-card purchase order is paid, issue the card and deliver the code.
 * Idempotent via gift_card_purchases.gift_card_id.
 */
final class IssuePurchasedGiftCardOnOrderPaidListener
{
    public bool $afterCommit = true;

    public function __construct(
        private readonly GiftCardPurchaseFulfillmentService $fulfillment,
    ) {}

    public function handle(OrderPaid $event): void
    {
        $order = Order::query()->find($event->data->orderId);
        if (!$order || $order->type !== 'gift_card') {
            return;
        }

        try {
            $this->fulfillment->fulfill($order);
        } catch (\Throwable $e) {
            Log::error('IssuePurchasedGiftCardOnOrderPaidListener failed', [
                'order_id' => $event->data->orderId,
                'error' => $e->getMessage(),
            ]);
            throw $e;
        }
    }
}
