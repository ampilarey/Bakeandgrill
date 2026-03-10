<?php

declare(strict_types=1);

namespace App\Domains\Orders\Events;

use App\Domains\Orders\DTOs\OrderPaidData;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Fired when paidTotal >= order.total. Canonical "money received" event.
 * Listeners: ConsumePromoRedemptionsListener, ConsumeLoyaltyHoldListener,
 *            DeductInventoryListener, DispatchReceiptPrintListener
 * Dispatched AFTER DB commit.
 */
class OrderPaid
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly OrderPaidData $data,
    ) {}
}
