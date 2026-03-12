<?php

declare(strict_types=1);

namespace App\Domains\Webhooks\Listeners;

use App\Domains\Inventory\Events\LowStockReached;
use App\Domains\Inventory\Events\StockLevelChanged;
use App\Domains\Notifications\Events\CustomerCreated;
use App\Domains\Orders\Events\OrderCancelled;
use App\Domains\Orders\Events\OrderCompleted;
use App\Domains\Orders\Events\OrderCreated;
use App\Domains\Orders\Events\OrderPaid;
use App\Domains\Orders\Events\OrderRefunded;
use App\Domains\Payments\Events\PaymentConfirmed;
use App\Domains\Reservations\Events\ReservationCreated;
use App\Domains\Shifts\Events\ShiftClosed;
use App\Domains\Shifts\Events\ShiftOpened;
use App\Domains\Webhooks\Services\WebhookDispatchService;
use Illuminate\Contracts\Queue\ShouldQueue;

/**
 * Single listener registered on ALL domain events.
 * Maps each event class to a webhook event name and queues delivery.
 */
class DispatchWebhookOnDomainEvent implements ShouldQueue
{
    public bool $afterCommit = true;

    private const EVENT_MAP = [
        OrderCreated::class       => 'order.created',
        OrderPaid::class          => 'order.paid',
        OrderCompleted::class     => 'order.completed',
        OrderCancelled::class     => 'order.cancelled',
        OrderRefunded::class      => 'order.refunded',
        PaymentConfirmed::class   => 'payment.confirmed',
        StockLevelChanged::class  => 'stock.changed',
        LowStockReached::class    => 'stock.low',
        ShiftOpened::class        => 'shift.opened',
        ShiftClosed::class        => 'shift.closed',
        CustomerCreated::class    => 'customer.created',
        ReservationCreated::class => 'reservation.created',
    ];

    public function __construct(private WebhookDispatchService $webhooks) {}

    public function handle(object $event): void
    {
        $eventName = self::EVENT_MAP[get_class($event)] ?? null;
        if (!$eventName) {
            return;
        }

        // All domain events carry a public readonly DTO in ->data
        $payload = isset($event->data) ? (array) $event->data : [];
        $this->webhooks->dispatch($eventName, $payload);
    }

    public static function getSupportedEventNames(): array
    {
        return array_values(self::EVENT_MAP);
    }
}
