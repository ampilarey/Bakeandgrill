<?php

declare(strict_types=1);

namespace App\Domains\Finance\Services;

use App\Models\Invoice;
use App\Models\Purchase;

/**
 * Keeps the payables list honest about a purchase order's fate.
 *
 * A supplier invoice can be raised from a PO ("create invoice from
 * purchase"), and until 2026-09-06 nothing ever looked at it again: cancel
 * the order, delete it, undo its delivery — the invoice sat in Accounts
 * Payable saying the full amount was still owed. An owed amount for an order
 * that no longer exists is not a debt, it is a mistake with a due date.
 *
 * The rule: when an order dies with nothing received, its unpaid invoice is
 * voided with it. An invoice already *paid* is never touched — money that
 * left is a fact, and unwinding it is a human conversation with the supplier,
 * so the caller gets a sentence to put in front of the human instead.
 */
final class PurchasePayableSync
{
    private const UNPAID = ['draft', 'sent', 'overdue'];

    /**
     * Void the unpaid invoice raised from this purchase, if there is one.
     *
     * @return string|null A warning for the caller when something needs a
     *                     human — a paid invoice that cannot be auto-voided.
     *                     Null when there was nothing to do or it was done.
     */
    public function voidUnpaidInvoiceFor(Purchase $purchase, string $because): ?string
    {
        $invoice = Invoice::where('type', 'purchase')
            ->where('purchase_id', $purchase->id)
            ->first();

        if ($invoice === null) {
            return null;
        }

        if (in_array($invoice->status, self::UNPAID, true)) {
            $invoice->update([
                'status' => 'void',
                'notes' => trim(($invoice->notes ? $invoice->notes . "\n" : '') . 'Voided: ' . $because),
            ]);

            return null;
        }

        if (in_array($invoice->status, ['void', 'cancelled'], true)) {
            return null;
        }

        return 'Invoice ' . $invoice->invoice_number . ' raised from this order is already '
            . $invoice->status . ' and was left alone — settle it with the supplier directly.';
    }

    /**
     * A caution for actions that change what an order is worth while its
     * invoice keeps the old figure — an undo, or a line edit.
     */
    public function warnIfInvoiceOutOfStep(Purchase $purchase): ?string
    {
        $invoice = Invoice::where('type', 'purchase')
            ->where('purchase_id', $purchase->id)
            ->whereNotIn('status', ['void', 'cancelled'])
            ->first();

        if ($invoice === null) {
            return null;
        }

        return 'Invoice ' . $invoice->invoice_number . ' was raised from this order and still shows '
            . 'MVR ' . number_format((float) $invoice->total, 2) . ' — check it on the Invoices page.';
    }
}
