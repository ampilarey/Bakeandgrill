<?php

declare(strict_types=1);

namespace App\Domains\Orders\Events;

use App\Domains\Orders\DTOs\OrderCancelledData;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Fired when an order is cancelled.
 * Listeners: ReleasePromoReservationListener, ReleaseLoyaltyHoldListener
 */
class OrderCancelled
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly OrderCancelledData $data,
    ) {}
}
