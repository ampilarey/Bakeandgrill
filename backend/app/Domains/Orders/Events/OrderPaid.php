<?php

declare(strict_types=1);

namespace App\Domains\Orders\Events;

use App\Models\Order;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Fired when an order is fully paid (paidTotal >= order.total).
 *
 * This is the canonical "money received" event.
 * All side effects that depend on confirmed payment MUST listen here:
 *   - ConsumePromoRedemptionsListener
 *   - ConsumeLoyaltyHoldListener
 *   - DeductInventoryListener
 *   - DispatchReceiptPrintListener
 *
 * NOTE: This event is dispatched AFTER DB commit (afterCommit = true on all listeners).
 */
class OrderPaid
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly Order $order,
        public readonly bool $printReceipt = true,
    ) {}
}
