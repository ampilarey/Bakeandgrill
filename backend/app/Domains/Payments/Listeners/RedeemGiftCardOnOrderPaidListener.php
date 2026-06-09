<?php

declare(strict_types=1);

namespace App\Domains\Payments\Listeners;

use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Payments\Services\GiftCardRedemptionService;
use App\Models\Order;
use Illuminate\Support\Facades\DB;

final class RedeemGiftCardOnOrderPaidListener
{
    public function __construct(
        private readonly GiftCardRedemptionService $giftCards,
    ) {}

    public function handle(OrderPaid $event): void
    {
        DB::transaction(function () use ($event): void {
            $order = Order::lockForUpdate()->find($event->data->orderId);
            if ($order) {
                $this->giftCards->redeemForOrder($order);
            }
        });
    }
}
