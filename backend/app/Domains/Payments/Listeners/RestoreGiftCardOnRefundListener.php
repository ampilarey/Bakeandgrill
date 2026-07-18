<?php

declare(strict_types=1);

namespace App\Domains\Payments\Listeners;

use App\Domains\Orders\Events\OrderRefunded;
use App\Domains\Payments\Services\GiftCardRedemptionService;
use App\Models\Order;

/**
 * Credit gift card balance back when a redeemed order is refunded.
 *
 * Runs synchronously (after commit) so refunded balance is restored even if
 * the queue worker is down — same pattern as payment-confirmation SMS.
 */
class RestoreGiftCardOnRefundListener
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

        $this->giftCards->restoreForOrder(
            $order,
            $event->data->refundRatio,
            $event->data->refundId,
        );
    }
}
