<?php

declare(strict_types=1);

namespace App\Domains\Orders\Listeners;

use App\Domains\Orders\Events\OrderStatusChanged;
use App\Domains\Orders\Support\GiftOrder;
use App\Models\Order;

/** A gift on the way: the receiver may get one text (feature 10). */
class TellGiftReceiverListener
{
    public function handle(OrderStatusChanged $event): void
    {
        if ($event->data->status !== 'on_the_way') {
            return;
        }
        $order = Order::with('customer')->find($event->data->orderId);
        if ($order !== null) {
            GiftOrder::tellReceiver($order);
        }
    }
}
