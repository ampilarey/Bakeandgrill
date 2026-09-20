<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Purchase;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Money out against a purchase order (owner, 2026-09-21: close the buying
 * loop). A PO knew its total and whether the goods arrived; this records
 * whether, when and how it was paid, so the supplier page can say what is
 * still owed.
 */
class PurchasePaymentController extends Controller
{
    public const METHODS = ['cash', 'transfer', 'other'];

    /** POST /purchases/{id}/payment — record a payment, part or whole. */
    public function store(Request $request, int $id, AuditLogService $audit): JsonResponse
    {
        $purchase = Purchase::with(['supplier', 'items.inventoryItem.purchaseUnits'])->findOrFail($id);

        if (!in_array((string) $purchase->status, Purchase::OWING_STATUSES, true)) {
            throw ValidationException::withMessages(['amount' => ['A draft or cancelled order has nothing to pay.']]);
        }

        $data = $request->validate([
            // Omitted means "the rest of it".
            'amount' => ['nullable', 'numeric', 'min:0.01'],
            'paid_on' => ['nullable', 'date'],
            'method' => ['nullable', 'string', 'in:' . implode(',', self::METHODS)],
            'reference' => ['nullable', 'string', 'max:120'],
        ]);

        $owed = (float) $purchase->owed;
        $amount = isset($data['amount']) ? round((float) $data['amount'], 2) : $owed;
        if ($owed <= 0.0) {
            throw ValidationException::withMessages(['amount' => ['This order is already paid in full.']]);
        }
        if ($amount > $owed + 0.005) {
            throw ValidationException::withMessages(['amount' => ['That is more than the MVR ' . number_format($owed, 2) . ' still owed.']]);
        }

        $before = $purchase->only(['paid_amount', 'paid_at', 'payment_method', 'payment_ref']);
        $purchase->paid_amount = round((float) $purchase->paid_amount + $amount, 2);
        $purchase->paid_at = $data['paid_on'] ?? now()->toDateString();
        if (!empty($data['method'])) {
            $purchase->payment_method = $data['method'];
        }
        if (array_key_exists('reference', $data) && $data['reference'] !== null && $data['reference'] !== '') {
            $purchase->payment_ref = $data['reference'];
        }
        $purchase->save();

        $audit->log(
            'purchase.payment_recorded',
            'Purchase',
            $purchase->id,
            $before,
            $purchase->only(['paid_amount', 'paid_at', 'payment_method', 'payment_ref']),
            ['amount' => $amount, 'owed_after' => $purchase->owed],
            $request,
        );

        return response()->json([
            'message' => $purchase->payment_status === 'paid'
                ? 'Marked as paid.'
                : 'Payment recorded. MVR ' . number_format((float) $purchase->owed, 2) . ' still owed.',
            'purchase' => $purchase->fresh(['supplier', 'items.inventoryItem.purchaseUnits']),
        ]);
    }

    /** DELETE /purchases/{id}/payment — undo, for a payment recorded on the wrong order. */
    public function destroy(Request $request, int $id, AuditLogService $audit): JsonResponse
    {
        $purchase = Purchase::findOrFail($id);
        $before = $purchase->only(['paid_amount', 'paid_at', 'payment_method', 'payment_ref']);

        $purchase->forceFill(['paid_amount' => 0, 'paid_at' => null, 'payment_method' => null, 'payment_ref' => null])->save();

        $audit->log('purchase.payment_cleared', 'Purchase', $purchase->id, $before, [], [], $request);

        return response()->json([
            'message' => 'Payment cleared.',
            'purchase' => $purchase->fresh(['supplier', 'items.inventoryItem.purchaseUnits']),
        ]);
    }
}
