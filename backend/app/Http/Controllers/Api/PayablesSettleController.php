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
 * "I paid these" (owner, 2026-11-15: "it says I owe to the shops. But I pay and
 * bring items"). The Owed to suppliers card lists orders with money still to
 * pay; a shop paid at the counter whose order was saved as not paid sits there
 * until each order is opened and marked. This marks them together: one shop's
 * orders, or every order on the card.
 *
 * Each is dated its own purchase day, since that is when the money was handed
 * over, and noted so anyone opening one later can see it was marked in a batch.
 * One still owed can be put back by undoing its payment on the shop's page.
 */
class PayablesSettleController extends Controller
{
    public const REFERENCE = 'Marked paid together';

    public function settle(Request $request, AuditLogService $audit): JsonResponse
    {
        $data = $request->validate([
            'all' => ['sometimes', 'boolean'],
            'supplier_id' => ['nullable', 'integer'],
            'name' => ['nullable', 'string', 'max:200'],
            'method' => ['nullable', 'string', 'in:' . implode(',', PurchasePaymentController::METHODS)],
        ]);

        $all = (bool) ($data['all'] ?? false);
        $supplierId = $data['supplier_id'] ?? null;
        $name = mb_strtolower(trim((string) ($data['name'] ?? '')));
        if (!$all && $supplierId === null && $name === '') {
            throw ValidationException::withMessages(['supplier_id' => ['Say which shop, or all of them.']]);
        }

        $orders = Purchase::query()
            ->whereIn('status', Purchase::OWING_STATUSES)
            ->whereColumn('paid_amount', '<', 'total')
            ->when(!$all && $supplierId !== null, fn ($q) => $q->where('supplier_id', $supplierId))
            ->when(!$all && $supplierId === null, fn ($q) => $q->whereNull('supplier_id'))
            ->orderBy('purchase_date')
            ->limit(5000)
            ->get()
            ->filter(fn (Purchase $p) => (float) $p->owed > 0.0)
            // A shop with no supplier record is known by the name typed on the order.
            ->when(!$all && $supplierId === null, fn ($c) => $c->filter(
                fn (Purchase $p) => mb_strtolower(trim((string) $p->supplier_name_text)) === $name,
            ))
            ->values();

        if ($orders->isEmpty()) {
            return response()->json(['message' => 'Nothing is showing as owed there.', 'settled' => 0, 'total' => 0.0]);
        }

        $total = round((float) $orders->sum(fn (Purchase $p) => (float) $p->owed), 2);
        $method = $data['method'] ?? 'cash';

        // One entry for the lot: what was cleared, when, and by whom.
        $audit->log('purchase.payables_settled', 'Purchase', null, [], [], [
            'all' => $all,
            'supplier_id' => $supplierId,
            'name' => $name !== '' ? $name : null,
            'orders' => $orders->count(),
            'total' => $total,
            'method' => $method,
            'purchase_numbers' => $orders->pluck('purchase_number')->all(),
        ], $request);

        foreach ($orders as $order) {
            $order->forceFill([
                'paid_amount' => round((float) $order->total, 2),
                'paid_at' => $order->purchase_date ?? $order->created_at?->toDateString(),
                'payment_method' => $method,
                'payment_ref' => self::REFERENCE,
            ])->save();
        }

        return response()->json([
            'message' => 'Marked ' . $orders->count() . ' order' . ($orders->count() === 1 ? '' : 's')
                . ' as paid, MVR ' . number_format($total, 2) . '.',
            'settled' => $orders->count(),
            'total' => $total,
        ]);
    }
}
