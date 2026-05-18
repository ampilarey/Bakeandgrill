<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Order;

/**
 * Single source of truth for valid order status transitions.
 *
 * All status changes must flow through this class.  Any controller,
 * listener, or command that needs to move an order from state A to B
 * should call OrderStatusMachine::assertTransitionAllowed() BEFORE
 * calling $order->update(['status' => $newStatus]).
 *
 * Using this pattern:
 *  - Prevents invalid transitions at the domain level, not just in HTTP handlers.
 *  - Gives a single place to audit the full state machine.
 *  - All existing routes/payloads/behaviour are preserved — only guard logic is centralised.
 *
 * ─────────────────────────────────────────────────────────────────────
 * State machine diagram
 * ─────────────────────────────────────────────────────────────────────
 *
 *  payment_pending ─→ paid           (BML webhook: CONFIRMED)
 *  payment_pending ─→ pending        (PaymentConfirmedListener: online order confirmed → back to kitchen queue)
 *  payment_pending ─→ cancelled      (BML webhook: FAILED/CANCELLED/EXPIRED, or stale cleanup)
 *
 *  pending  ─→ in_progress           (KDS: start)
 *  pending  ─→ held                  (POS: hold)
 *  pending  ─→ paid                  (POS: full cash payment)
 *  pending  ─→ partial               (POS: partial payment)
 *  pending  ─→ cancelled
 *
 *  paid     ─→ in_progress           (KDS: start, for online orders)
 *  paid     ─→ ready                 (KDS: bump, when skipping in_progress)
 *  paid     ─→ completed             (KDS: bump from ready when previously skipped to ready directly)
 *  paid     ─→ refunded              (Refund: full)
 *  paid     ─→ partially_refunded    (Refund: partial — money already gone but not the whole ticket)
 *  paid     ─→ cancelled             (Admin cancel after payment — unusual)
 *
 *  partial  ─→ paid                  (remaining payment collected)
 *  partial  ─→ partially_refunded    (Refund: partial against partial collection)
 *  partial  ─→ cancelled
 *
 *  partially_refunded ─→ refunded    (Further refund brings total to amount-paid cap)
 *
 *  in_progress ─→ ready              (KDS: bump)
 *  in_progress ─→ held               (POS: hold)
 *  in_progress ─→ cancelled
 *
 *  ready    ─→ completed             (KDS: bump from ready)
 *  ready    ─→ in_progress           (KDS: recall — "I bumped that too early")
 *  ready    ─→ cancelled
 *
 *  held     ─→ pending               (POS: resume)
 *  held     ─→ cancelled
 *
 *  completed ─→ in_progress          (KDS: recall — "the customer came back, redo it")
 *  completed ─→ refunded             (Refund: partial or full post-completion)
 *
 *  cancelled ─→ (terminal — no transitions out)
 *  refunded  ─→ (terminal — no transitions out)
 */
class OrderStatusMachine
{
    /**
     * Allowed transitions: from_status → [allowed to_statuses]
     *
     * @var array<string, list<string>>
     */
    private const TRANSITIONS = [
        // 'pending' is used by PaymentConfirmedListener to move confirmed online
        // orders back into the kitchen queue before KDS picks them up.
        'payment_pending' => ['paid', 'pending', 'cancelled'],
        'pending' => ['in_progress', 'ready', 'held', 'paid', 'partial', 'cancelled'],
        'paid' => ['in_progress', 'ready', 'completed', 'refunded', 'partially_refunded', 'cancelled'],
        'partial' => ['paid', 'in_progress', 'partially_refunded', 'cancelled'],
        'in_progress' => ['ready', 'held', 'cancelled'],
        'ready' => ['completed', 'in_progress', 'cancelled'],
        'held' => ['pending', 'cancelled'],
        'completed' => ['in_progress', 'refunded', 'partially_refunded'],
        'partially_refunded' => ['refunded'],
        'cancelled' => [],
        'refunded' => [],
    ];

    /** All recognised statuses. */
    public const ALL_STATUSES = [
        'payment_pending', 'pending', 'paid', 'partial',
        'in_progress', 'ready', 'held', 'completed',
        'partially_refunded', 'cancelled', 'refunded',
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
     * Call this inside a DB::transaction() / lockForUpdate() block before
     * setting the new status on the model.
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
     * Returns the valid next states from a given status.
     *
     * @return list<string>
     */
    public function nextStates(string $fromStatus): array
    {
        return self::TRANSITIONS[$fromStatus] ?? [];
    }
}
