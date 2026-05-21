<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Domains\Payments\Repositories\PaymentRepositoryInterface;
use App\Models\Order;

/**
 * Single place to derive `payment_status` from confirmed payment rows.
 *
 * Keeps POS UNPAID badges, BML partial pay-links, and Stripe webhooks
 * aligned without duplicating COALESCE laari math in every controller.
 */
class OrderPaymentStateService
{
    /** @var string[] */
    private const PAID_STATUSES = ['paid', 'confirmed', 'completed'];

    public function __construct(
        private readonly PaymentRepositoryInterface $payments,
    ) {}

    public function paidLaarForOrder(int $orderId): int
    {
        return $this->payments->sumAmountLaarForOrder($orderId, self::PAID_STATUSES);
    }

    public function orderTotalLaar(Order $order): int
    {
        return (int) ($order->total_laar ?? round((float) ($order->total ?? 0) * 100));
    }

    /**
     * Recompute and persist payment_status from payment rows.
     *
     * @return 'paid'|'partial'|'unpaid'
     */
    public function syncPaymentStatus(Order $order): string
    {
        $paidLaar = $this->paidLaarForOrder($order->id);
        $orderLaar = $this->orderTotalLaar($order);

        $newStatus = match (true) {
            $orderLaar <= 0, $paidLaar >= $orderLaar => 'paid',
            $paidLaar > 0 => 'partial',
            default => 'unpaid',
        };

        if ($order->payment_status !== $newStatus) {
            $order->update(['payment_status' => $newStatus]);
        }

        return $newStatus;
    }

    public function isFullyPaid(Order $order): bool
    {
        $orderLaar = $this->orderTotalLaar($order);

        return $orderLaar <= 0 || $this->paidLaarForOrder($order->id) >= $orderLaar;
    }
}
