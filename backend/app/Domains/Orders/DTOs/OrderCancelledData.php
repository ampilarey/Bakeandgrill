<?php

declare(strict_types=1);

namespace App\Domains\Orders\DTOs;

use App\Models\Order;

/**
 * DTO carried by the OrderCancelled event.
 * Carries only primitive IDs and scalars — no Eloquent models.
 */
readonly class OrderCancelledData
{
    public function __construct(
        public int $orderId,
        public string $orderNumber,
        public ?int $customerId,
    ) {}

    public static function fromOrder(Order $order): self
    {
        return new self(
            orderId: $order->id,
            orderNumber: $order->order_number,
            customerId: $order->customer_id,
        );
    }
}
