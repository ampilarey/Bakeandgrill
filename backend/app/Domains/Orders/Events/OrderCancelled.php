<?php

declare(strict_types=1);

namespace App\Domains\Orders\Events;

use App\Models\Order;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Fired when an order is cancelled.
 *
 * Listeners:
 *   - ReleasePromoReservationListener (release draft OrderPromotion)
 *   - ReleaseLoyaltyHoldListener (release loyalty hold → refund points_held)
 */
class OrderCancelled
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(public readonly Order $order) {}
}
