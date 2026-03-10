<?php

declare(strict_types=1);

namespace App\Domains\Orders\DTOs;

use App\Models\Order;

/**
 * DTO carried by the OrderCreated event.
 * Carries only primitive IDs and scalars — no Eloquent models.
 */
readonly class OrderCreatedData
{
    public function __construct(
        public int $orderId,
        public string $orderNumber,
        public string $orderType,
        public ?int $customerId,
        public float $total,
        public bool $printKitchen,
    ) {}

    public static function fromOrder(Order $order, bool $printKitchen = true): self
    {
        return new self(
            orderId: $order->id,
            orderNumber: $order->order_number,
            orderType: $order->type,
            customerId: $order->customer_id,
            total: (float) $order->total,
            printKitchen: $printKitchen,
        );
    }
}
