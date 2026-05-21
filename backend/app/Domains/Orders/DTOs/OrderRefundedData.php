<?php

declare(strict_types=1);

namespace App\Domains\Orders\DTOs;

use App\Models\Refund;

readonly class OrderRefundedData
{
    public function __construct(
        public int $refundId,
        public int $orderId,
        public string $orderNumber,
        public float $amount,
        public string $reason,
        public float $refundRatio = 1.0,
    ) {}

    public static function fromRefund(Refund $refund, float $refundRatio = 1.0): self
    {
        return new self(
            refundId: $refund->id,
            orderId: $refund->order_id,
            orderNumber: $refund->order?->order_number ?? (string) $refund->order_id,
            amount: (float) $refund->amount,
            reason: $refund->reason ?? 'No reason provided',
            refundRatio: max(0.0, min(1.0, $refundRatio)),
        );
    }
}
