<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Services;

use App\Models\Purchase;

/**
 * What may still be done to a purchase order.
 *
 * Owner, 2026-09-06: "how to cancel/delete or edit the po, admin must be able
 * to do that." Only two of those existed. "Reject" cancelled a draft or an
 * ordered PO under approval-workflow wording, `PATCH /purchases/{id}` edited
 * the header and could not touch a single line, and nothing deleted anything —
 * a purchase order raised by mistake was permanent.
 *
 * One rule governs all three: **a purchase order that has moved stock or money
 * must never be quietly rewritten.** Once a line is received it has produced a
 * stock movement, a weighted-average cost change and a price-history row, and
 * every one of those is now somebody's evidence. Editing the line underneath
 * them would leave the ledger telling a story that never happened.
 *
 * So the gate is not the status alone — it is the status *and* whether
 * anything actually came in. An "ordered" PO with nothing received is still
 * only a piece of paper and may be changed freely; the moment one crate lands,
 * it is history.
 *
 * Every method returns null when the thing is allowed and a sentence when it
 * is not, so the reason reaches the screen instead of a disabled button that
 * explains nothing.
 */
final class PurchaseEditPolicy
{
    /** Nothing may be changed once a purchase is in one of these states. */
    private const FINAL_STATES = ['received', 'cancelled'];

    /**
     * May the lines be added to, removed or repriced?
     *
     * A cancelled order is deliberately not editable: it is a record of
     * something that did not happen, and editing it would make it a record of
     * a different thing that also did not happen.
     */
    public function whyCannotEdit(Purchase $purchase): ?string
    {
        if (in_array($purchase->status, self::FINAL_STATES, true)) {
            return $purchase->status === 'received'
                ? 'This order has been received. Its stock and prices are already recorded, so the lines cannot be changed — undo the receipt first if the delivery was wrong.'
                : 'This order was cancelled. Raise a new one rather than editing it.';
        }

        if ($this->receivedAnything($purchase)) {
            return 'Some of this order has already arrived, so the lines cannot be changed. Cancel what is left, or undo the receipt to start again.';
        }

        return null;
    }

    /**
     * May it be cancelled?
     *
     * Allowed on a partly-received order too — a supplier who cannot deliver
     * the rest is the ordinary reason to close one out, and cancelling never
     * touches what already came in.
     */
    public function whyCannotCancel(Purchase $purchase): ?string
    {
        if ($purchase->status === 'cancelled') {
            return 'This order is already cancelled.';
        }

        if ($purchase->status === 'received') {
            return 'This order has been received in full. Cancelling it would not put the stock back — undo the receipt first, which does.';
        }

        return null;
    }

    /**
     * May it be removed from the list altogether?
     *
     * Only a draft nobody approved, or an already-cancelled order that never
     * received a thing. An approved order that was cancelled keeps its place:
     * somebody signed it off, and a purchase that vanishes from the record is
     * how a trail goes missing.
     *
     * Deleting is soft, so the row survives for an auditor even though it
     * leaves every screen.
     */
    public function whyCannotDelete(Purchase $purchase): ?string
    {
        if ($this->receivedAnything($purchase)) {
            return 'Stock arrived against this order, so it is part of the record and cannot be deleted. Undo the receipt first if it never really arrived.';
        }

        if (!in_array($purchase->status, ['draft', 'cancelled'], true)) {
            return 'Only a draft or a cancelled order can be deleted. Cancel this one first.';
        }

        return null;
    }

    /**
     * May the receipt be undone, putting the order back to unreceived?
     *
     * Owner, 2026-09-06: "how can admin del or edit PO?" — every order in the
     * business was `received`, so all three answers above were "no" and the
     * feature did nothing for anybody. The rule was right and the conclusion
     * was useless: I locked the door and handed over no key.
     *
     * This is the key. Not a licence to rewrite history — the way out of a
     * receipt that should not have happened is to *reverse* it, visibly: the
     * stock goes back with its own movements, the price points and the input
     * tax come off, and the order returns to `ordered` where editing,
     * cancelling and deleting already work. Nothing is erased; the undo is
     * itself a recorded event.
     */
    public function whyCannotUndoReceipt(Purchase $purchase): ?string
    {
        if (!$this->receivedAnything($purchase)) {
            return 'Nothing has been received against this order, so there is nothing to undo.';
        }

        return null;
    }

    /**
     * The four answers together, for a payload.
     *
     * @return array{can_edit: bool, can_cancel: bool, can_delete: bool, can_undo_receipt: bool, edit_blocked_reason: ?string, cancel_blocked_reason: ?string, delete_blocked_reason: ?string, undo_receipt_blocked_reason: ?string}
     */
    public function summary(Purchase $purchase): array
    {
        $edit = $this->whyCannotEdit($purchase);
        $cancel = $this->whyCannotCancel($purchase);
        $delete = $this->whyCannotDelete($purchase);
        $undo = $this->whyCannotUndoReceipt($purchase);

        return [
            'can_edit' => $edit === null,
            'can_cancel' => $cancel === null,
            'can_delete' => $delete === null,
            'can_undo_receipt' => $undo === null,
            'edit_blocked_reason' => $edit,
            'cancel_blocked_reason' => $cancel,
            'delete_blocked_reason' => $delete,
            'undo_receipt_blocked_reason' => $undo,
        ];
    }

    /**
     * Has any quantity at all come in against this order?
     *
     * Read off the lines rather than the status, because the two can disagree:
     * a receive that landed one crate leaves the order 'partial', but a
     * hand-edited status could say anything and the lines cannot lie about it.
     */
    private function receivedAnything(Purchase $purchase): bool
    {
        $items = $purchase->relationLoaded('items')
            ? $purchase->items
            : $purchase->items()->get(['id', 'purchase_id', 'received_quantity']);

        foreach ($items as $item) {
            if ((float) ($item->received_quantity ?? 0) > 0) {
                return true;
            }
        }

        return false;
    }
}
