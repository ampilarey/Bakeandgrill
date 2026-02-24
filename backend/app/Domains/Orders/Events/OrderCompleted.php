<?php

declare(strict_types=1);

namespace App\Domains\Orders\Events;

use App\Models\Order;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Fired when an order reaches terminal state (paid + kitchen bumped, or online fulfilled).
 *
 * NOTE: Loyalty points EARNING happens here (not on OrderPaid),
 * because points should only be awarded once the order is truly complete.
 */
class OrderCompleted
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(public readonly Order $order) {}
}
