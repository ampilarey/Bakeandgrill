<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Order;
use Illuminate\Support\Collection;

/**
 * Describes how an order was settled for customer-facing and staff UIs.
 */
final class OrderSettlement
{
    private const PAID_STATUSES = ['paid', 'completed', 'confirmed'];

    /**
     * @return array{
     *   settlement: 'credit_account'|'mixed'|'standard'|'unpaid',
     *   paid_on_credit: bool,
     *   label: string,
     *   short_label: string
     * }
     */
    public static function forOrder(Order $order): array
    {
        /** @var Collection<int, \App\Models\Payment> $payments */
        $payments = $order->relationLoaded('payments')
            ? $order->payments
            : $order->payments()->get();

        $paidPayments = $payments->filter(
            fn ($p) => in_array((string) ($p->status ?? ''), self::PAID_STATUSES, true),
        );

        $creditLaar = (int) $paidPayments
            ->where('method', 'house_account')
            ->sum(fn ($p) => (int) ($p->amount_laar ?? round((float) $p->amount * 100)));

        $orderTotalLaar = (int) ($order->total_laar ?? round((float) $order->total * 100));

        if ($creditLaar > 0 && $creditLaar >= $orderTotalLaar) {
            return [
                'settlement' => 'credit_account',
                'paid_on_credit' => true,
                'label' => 'Paid on credit account',
                'short_label' => 'On credit',
            ];
        }

        if ($creditLaar > 0) {
            return [
                'settlement' => 'mixed',
                'paid_on_credit' => true,
                'label' => 'Part paid on credit account',
                'short_label' => 'Partial credit',
            ];
        }

        if ($order->payment_status === 'paid' || $order->paid_at !== null) {
            return [
                'settlement' => 'standard',
                'paid_on_credit' => false,
                'label' => 'Paid',
                'short_label' => 'Paid',
            ];
        }

        return [
            'settlement' => 'unpaid',
            'paid_on_credit' => false,
            'label' => 'Unpaid',
            'short_label' => 'Unpaid',
        ];
    }
}
