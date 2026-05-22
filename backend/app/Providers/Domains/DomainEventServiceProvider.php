<?php

declare(strict_types=1);

namespace App\Providers\Domains;

use App\Domains\Inventory\Events\LowStockReached;
use App\Domains\Inventory\Events\StockLevelChanged;
use App\Domains\Inventory\Listeners\DeductInventoryListener;
use App\Domains\Inventory\Listeners\DeductPreparedStockListener;
use App\Domains\Customers\Listeners\ReverseCreditOnRefundListener;
use App\Domains\Inventory\Listeners\RestoreInventoryOnRefundListener;
use App\Domains\Loyalty\Listeners\ConsumeLoyaltyHoldListener;
use App\Domains\Loyalty\Listeners\EarnPointsFromOrderListener;
use App\Domains\Loyalty\Listeners\ReleaseLoyaltyHoldListener;
use App\Domains\Marketing\Listeners\RecordReferralRedemptionListener;
use App\Domains\Notifications\Events\CustomerCreated;
use App\Domains\Notifications\Listeners\SendCustomerOrderStatusSmsListener;
use App\Domains\Notifications\Listeners\SendOnlineOrderCompletionReceiptSmsListener;
use App\Domains\Notifications\Listeners\SendOrderConfirmationListener;
use App\Domains\Notifications\Listeners\SendOrderStatusPushListener;
use App\Domains\Notifications\Listeners\SendPaymentConfirmationListener;
use App\Domains\Orders\Events\OrderCancelled;
use App\Domains\Orders\Events\OrderCompleted;
use App\Domains\Orders\Events\OrderCreated;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Events\OrderRefunded;
use App\Domains\Orders\Events\OrderStatusChanged;
use App\Domains\Orders\Listeners\ReleasePreparedStockOnCancelListener;
use App\Domains\Payments\Events\PaymentConfirmed;
use App\Domains\Payments\Listeners\PaymentConfirmedListener;
use App\Domains\Printing\Listeners\DispatchKitchenPrintListener;
use App\Domains\Printing\Listeners\DispatchReceiptPrintListener;
use App\Domains\Promotions\Listeners\ConsumePromoRedemptionsListener;
use App\Domains\Promotions\Listeners\ReleasePromoReservationListener;
use App\Domains\Realtime\Listeners\PublishOrderStatusToRedisListener;
use App\Domains\Reservations\Events\ReservationCreated;
use App\Domains\Reservations\Listeners\SendReservationConfirmationListener;
use App\Domains\Shifts\Events\ShiftClosed;
use App\Domains\Shifts\Events\ShiftOpened;
use App\Domains\Sms\Listeners\SendNewCustomerNotificationListener;
use App\Domains\Sms\Listeners\SendStaffOrderNotificationListener;
use App\Domains\Webhooks\Listeners\DispatchWebhookOnDomainEvent;
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
            DispatchWebhookOnDomainEvent::class,
            SendOrderConfirmationListener::class,
            SendStaffOrderNotificationListener::class,
        ],

        OrderPaid::class => [
            DeductInventoryListener::class,
            DeductPreparedStockListener::class,
            DispatchReceiptPrintListener::class,
            DispatchKitchenPrintListener::class, // online orders: kitchen print fires here after payment confirmed
            ConsumePromoRedemptionsListener::class,
            ConsumeLoyaltyHoldListener::class,
            RecordReferralRedemptionListener::class,
            SendPaymentConfirmationListener::class,
            DispatchWebhookOnDomainEvent::class,
        ],

        OrderCompleted::class => [
            EarnPointsFromOrderListener::class,
            DispatchWebhookOnDomainEvent::class,
        ],

        OrderCancelled::class => [
            ReleasePreparedStockOnCancelListener::class,
            ReleasePromoReservationListener::class,
            ReleaseLoyaltyHoldListener::class,
            DispatchWebhookOnDomainEvent::class,
        ],

        PaymentConfirmed::class => [
            PaymentConfirmedListener::class,
        ],

        ReservationCreated::class => [
            SendReservationConfirmationListener::class,
            DispatchWebhookOnDomainEvent::class,
        ],

        OrderRefunded::class => [
            RestoreInventoryOnRefundListener::class,
            ReverseCreditOnRefundListener::class,
            DispatchWebhookOnDomainEvent::class,
        ],

        StockLevelChanged::class => [
            DispatchWebhookOnDomainEvent::class,
        ],

        LowStockReached::class => [
            DispatchWebhookOnDomainEvent::class,
        ],

        ShiftOpened::class => [
            DispatchWebhookOnDomainEvent::class,
        ],

        ShiftClosed::class => [
            DispatchWebhookOnDomainEvent::class,
        ],

        CustomerCreated::class => [
            DispatchWebhookOnDomainEvent::class,
            SendNewCustomerNotificationListener::class,
        ],

        // Fires on every status change — real-time SSE, push notifications, customer SMS
        OrderStatusChanged::class => [
            PublishOrderStatusToRedisListener::class,
            SendOrderStatusPushListener::class,
            SendCustomerOrderStatusSmsListener::class,
            SendOnlineOrderCompletionReceiptSmsListener::class,
            SendStaffOrderNotificationListener::class,
        ],
    ];
}
