<?php

declare(strict_types=1);

namespace App\Domains\Payments\DTOs;

use App\Models\Order;
use App\Models\Payment;

/**
 * DTO carried by the PaymentConfirmed event.
 * Carries only primitive IDs and scalars — no Eloquent models.
 */
readonly class PaymentConfirmedData
{
    public function __construct(
        public int $paymentId,
        public int $orderId,
        public int $amountLaar,
        public string $currency,
        public string $orderStatus,
    ) {}

    public static function fromPaymentAndOrder(Payment $payment, Order $order): self
    {
        return new self(
            paymentId: $payment->id,
            orderId: $order->id,
            amountLaar: (int) $payment->amount_laar,
            currency: (string) $payment->currency,
            orderStatus: (string) $order->status,
        );
    }
}
