<?php

declare(strict_types=1);

namespace App\Domains\Orders\Events;

use App\Domains\Orders\DTOs\OrderStatusChangedData;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Fired whenever order.status changes (any transition).
 * Listeners: PublishOrderStatusToRedisListener, SendOrderStatusPushListener
 * Dispatched synchronously from OrderObserver::updated().
 */
class OrderStatusChanged
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly OrderStatusChangedData $data,
    ) {}
}
