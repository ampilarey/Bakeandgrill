<?php

declare(strict_types=1);

namespace App\Providers\Domains;

use App\Domains\Inventory\Listeners\DeductInventoryListener;
use App\Domains\Loyalty\Listeners\ConsumeLoyaltyHoldListener;
use App\Domains\Loyalty\Listeners\EarnPointsFromOrderListener;
use App\Domains\Loyalty\Listeners\ReleaseLoyaltyHoldListener;
use App\Domains\Orders\Events\OrderCancelled;
use App\Domains\Orders\Events\OrderCompleted;
use App\Domains\Orders\Events\OrderCreated;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Payments\Events\PaymentConfirmed;
use App\Domains\Printing\Listeners\DispatchKitchenPrintListener;
use App\Domains\Printing\Listeners\DispatchReceiptPrintListener;
use App\Domains\Promotions\Listeners\ConsumePromoRedemptionsListener;
use App\Domains\Promotions\Listeners\ReleasePromoReservationListener;
use Illuminate\Foundation\Support\Providers\EventServiceProvider;

/**
 * Central event → listener mapping for all domain events.
 *
 * All listeners MUST:
 *   1. Implement ShouldQueue
 *   2. Set $afterCommit = true
 *   3. Be idempotent (DB unique constraints + firstOrCreate patterns)
 */
class DomainEventServiceProvider extends EventServiceProvider
{
    protected $listen = [
        OrderCreated::class => [
            DispatchKitchenPrintListener::class,
        ],

        OrderPaid::class => [
            DeductInventoryListener::class,
            DispatchReceiptPrintListener::class,
            ConsumePromoRedemptionsListener::class,
            ConsumeLoyaltyHoldListener::class,
        ],

        OrderCompleted::class => [
            EarnPointsFromOrderListener::class,
        ],

        OrderCancelled::class => [
            ReleasePromoReservationListener::class,
            ReleaseLoyaltyHoldListener::class,
        ],

        PaymentConfirmed::class => [
            // PaymentConfirmedListener checks if order is fully paid → fires OrderPaid
            // Implemented in Phase 7
        ],
    ];
}
