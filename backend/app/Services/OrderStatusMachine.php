<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Order;

/**
 * Single source of truth for valid order status transitions.
 *
 * Prefer {@see OrderStatusTransitionService::transition()} for writes.
 * Callers may still assert then update; {@see \App\Observers\OrderObserver}
 * blocks illegal model updates as a second line of defence.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Kitchen / POS / payments
 * ─────────────────────────────────────────────────────────────────────
 *
 *  payment_pending ─→ paid | pending | cancelled
 *  pending ─→ in_progress | ready | held | paid | partial | payment_pending | cancelled
 *  paid ─→ in_progress | ready | completed | out_for_delivery | refunded | partially_refunded | cancelled
 *  partial ─→ paid | in_progress | ready | payment_pending | refunded | partially_refunded | cancelled
 *  in_progress ─→ ready | held | paid | partial | refunded | partially_refunded | cancelled
 *  ready ─→ completed | in_progress | out_for_delivery | paid | partial | refunded | partially_refunded | cancelled
 *  held ─→ pending | cancelled
 *
 * ─────────────────────────────────────────────────────────────────────
 * Delivery rider chain
 * ─────────────────────────────────────────────────────────────────────
 *
 *  ready | paid ─→ out_for_delivery
 *  out_for_delivery ─→ picked_up | cancelled
 *  picked_up ─→ on_the_way | cancelled
 *  on_the_way ─→ delivered | cancelled
 *  delivered ─→ completed | refunded | partially_refunded
 *
 *  completed ─→ in_progress (KDS recall) | refunded | partially_refunded
 *  cancelled / refunded — terminal
 */
class OrderStatusMachine
{
    /**
     * Allowed transitions: from_status → [allowed to_statuses]
     *
     * @var array<string, list<string>>
     */
    private const TRANSITIONS = [
        'payment_pending' => ['paid', 'pending', 'cancelled'],
        'pending' => ['in_progress', 'ready', 'held', 'paid', 'partial', 'payment_pending', 'cancelled'],
        'paid' => ['in_progress', 'ready', 'completed', 'out_for_delivery', 'refunded', 'partially_refunded', 'cancelled'],
        'partial' => ['paid', 'in_progress', 'ready', 'payment_pending', 'refunded', 'partially_refunded', 'cancelled'],
        'in_progress' => ['ready', 'held', 'paid', 'partial', 'refunded', 'partially_refunded', 'cancelled'],
        'ready' => ['completed', 'in_progress', 'out_for_delivery', 'paid', 'partial', 'refunded', 'partially_refunded', 'cancelled'],
        'held' => ['pending', 'cancelled'],
        'out_for_delivery' => ['picked_up', 'cancelled'],
        'picked_up' => ['on_the_way', 'cancelled'],
        'on_the_way' => ['delivered', 'cancelled'],
        'delivered' => ['completed', 'refunded', 'partially_refunded'],
        'completed' => ['in_progress', 'refunded', 'partially_refunded'],
        'partially_refunded' => ['refunded'],
        'cancelled' => [],
        'refunded' => [],
    ];

    /** All recognised statuses. */
    public const ALL_STATUSES = [
        'payment_pending', 'pending', 'paid', 'partial',
        'in_progress', 'ready', 'held',
        'out_for_delivery', 'picked_up', 'on_the_way', 'delivered',
        'completed', 'partially_refunded', 'cancelled', 'refunded',
    ];

    /**
     * Returns true when the transition from $fromStatus → $toStatus is valid.
     */
    public function isAllowed(string $fromStatus, string $toStatus): bool
    {
        return in_array($toStatus, self::TRANSITIONS[$fromStatus] ?? [], true);
    }

    /**
     * Throws a 422 abort when the transition is not allowed.
     *
     * @throws \Symfony\Component\HttpKernel\Exception\HttpException
     */
    public function assertTransitionAllowed(Order $order, string $toStatus): void
    {
        if (!$this->isAllowed($order->status, $toStatus)) {
            abort(
                422,
                "Invalid status transition: '{$order->status}' → '{$toStatus}' is not allowed.",
            );
        }
    }

    /**
     * @return list<string>
     */
    public function nextStates(string $fromStatus): array
    {
        return self::TRANSITIONS[$fromStatus] ?? [];
    }
}
