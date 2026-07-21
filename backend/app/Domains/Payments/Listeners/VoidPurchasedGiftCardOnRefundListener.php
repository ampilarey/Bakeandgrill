<?php

declare(strict_types=1);

namespace App\Domains\Payments\Listeners;

use App\Domains\Orders\Events\OrderRefunded;
use App\Domains\Payments\Services\GiftCardRedemptionService;
use App\Models\Order;

/**
 * When a `type=gift_card` purchase order is refunded, void the purchased card
 * so the recipient (or purchaser) can no longer spend it. RefundController
 * blocks partial refunds on gift-card orders, so full-refund is the contract;
 * this listener still handles partial-spend correctly by only voiding the
 * residual balance if the card has already been used.
 *
 * Runs synchronously (after commit) so voiding is not gated on the queue
 * worker being up — same pattern as RestoreGiftCardOnRefundListener.
 */
class VoidPurchasedGiftCardOnRefundListener
{
    public bool $afterCommit = true;

    public function __construct(
        private readonly GiftCardRedemptionService $giftCards,
    ) {}

    public function handle(OrderRefunded $event): void
    {
        $order = Order::query()->find($event->data->orderId);
        if (!$order) {
            return;
        }

        $this->giftCards->voidPurchasedCardForRefund($order, $event->data->refundId);
    }
}
