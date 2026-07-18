<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Listeners;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Orders\Events\OrderRefunded;
use App\Models\Order;

/**
 * Claw back earned loyalty points when a completed order is refunded.
 * Synchronous after commit — pairs with EarnPointsFromOrderListener.
 */
class ReverseLoyaltyEarnOnRefundListener
{
    public bool $afterCommit = true;

    public function __construct(private readonly LoyaltyLedgerService $loyalty) {}

    public function handle(OrderRefunded $event): void
    {
        $order = Order::query()->find($event->data->orderId);
        if (!$order || $order->type === 'gift_card') {
            return;
        }

        $this->loyalty->reverseEarnForRefund(
            $order,
            $event->data->refundRatio,
            $event->data->refundId,
        );
    }
}
