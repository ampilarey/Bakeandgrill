<?php

declare(strict_types=1);

namespace App\Domains\Orders\DTOs;

final class OrderStatusChangedData
{
    public function __construct(
        public readonly int    $orderId,
        public readonly string $status,
        public readonly ?int   $customerId,
        public readonly string $orderNumber,
        public readonly string $updatedAt,
    ) {}
}
