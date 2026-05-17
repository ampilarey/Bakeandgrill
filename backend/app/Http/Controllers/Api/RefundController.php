<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\DTOs\OrderRefundedData;
use App\Domains\Orders\Events\OrderRefunded;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRefundRequest;
use App\Models\Order;
use App\Models\Refund;
use App\Services\AuditLogService;
use App\Services\StockManagementService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class RefundController extends Controller
{
    public function index(Request $request)
    {
        Gate::authorize('refund.process');

        $allowedStatuses = ['pending', 'approved', 'rejected', 'processed'];
        $query = Refund::with(['order', 'user'])->orderByDesc('created_at');

        if ($request->filled('status') && in_array($request->query('status'), $allowedStatuses, true)) {
            $query->where('status', $request->query('status'));
        }

        return response()->json([
            'refunds' => $query->paginate(50),
        ]);
    }

    public function show($id)
    {
        Gate::authorize('refund.process');

        $refund = Refund::with(['order', 'user'])->findOrFail($id);

        return response()->json(['refund' => $refund]);
    }

    public function store(StoreRefundRequest $request, $orderId)
    {
        Gate::authorize('refund.process');

        $validated = $request->validated();
        $amount = (float) $validated['amount'];
        $amountLaar = (int) round($amount * 100);

        [$refund, $order] = DB::transaction(function () use ($validated, $amount, $amountLaar, $orderId, $request) {
            $order = Order::with(['items.item', 'items.variant'])->lockForUpdate()->findOrFail($orderId);

            $orderTotalLaar = (int) ($order->total_laar ?? round((float) ($order->total ?? 0) * 100));

            // Cap refunds against the amount the customer ACTUALLY PAID, not the
            // order total. A partially-paid order (e.g. MVR 50 collected on a
            // MVR 100 ticket) must never refund more than MVR 50.
            //
            // This matches the canonical "what counts as paid" query in
            // OrderController::addPayments — same status whitelist, same
            // COALESCE on the integer laari column for accuracy on legacy
            // POS payments that only populated `amount`.
            $paidLaar = (int) ($order->payments()
                ->whereIn('status', ['paid', 'completed', 'confirmed'])
                ->selectRaw('COALESCE(SUM(amount_laar), SUM(ROUND(amount * 100))) as total_laar')
                ->value('total_laar') ?? 0);

            $alreadyRefundedLaar = (int) round(
                (float) $order->refunds()->where('status', '!=', 'rejected')->sum('amount') * 100,
            );

            // Defense in depth: keep the historical order-total cap as a second
            // bound so an over-collected payment (unusual) still can't refund
            // more than the ticket was rung up for.
            $refundableLaar = min($paidLaar, $orderTotalLaar);

            if ($amountLaar + $alreadyRefundedLaar > $refundableLaar) {
                abort(422, sprintf(
                    'Refund would exceed amount paid. Paid: %s, already refunded: %s, max refundable: %s.',
                    number_format($paidLaar / 100, 2),
                    number_format($alreadyRefundedLaar / 100, 2),
                    number_format(max(0, $refundableLaar - $alreadyRefundedLaar) / 100, 2),
                ));
            }

            $refund = Refund::create([
                'order_id' => $order->id,
                'user_id' => $request->user()?->id,
                'amount' => $amount,
                'status' => $validated['status'] ?? 'approved',
                'reason' => $validated['reason'] ?? null,
            ]);

            // "Full refund" = refunding everything that was actually collected
            // (matches the cap above). Restoring stock for items the customer
            // never paid for would be wrong.
            $isFullRefund = ($amountLaar + $alreadyRefundedLaar >= $refundableLaar) && $refundableLaar > 0;

            if ($isFullRefund) {
                $order->update(['status' => 'refunded']);

                // Restore stock for each line item. Idempotent: StockMovement
                // unique key blocks any double-restore.
                $stockService = app(StockManagementService::class);
                foreach ($order->items as $orderItem) {
                    $item = $orderItem->item;
                    if (!$item) {
                        continue;
                    }

                    // Variant-level stock takes priority when the variant tracks
                    // its own inventory (mirrors the deduction logic in OrderCreationService).
                    $variant = $orderItem->variant;
                    if ($variant && $variant->track_stock) {
                        $key = 'refund:order:' . $order->id . ':variant:' . $orderItem->id;
                        $stockService->restoreVariantStock(
                            $variant,
                            (int) $orderItem->quantity,
                            $key,
                            $order->id,
                            $request->user()?->id,
                        );

                        continue; // Variant tracked — do not also restore item-level stock.
                    }

                    // Item-level stock (non-variant tracked products).
                    if (!$item->track_stock || $item->availability_type !== 'stock_based') {
                        continue;
                    }
                    $key = 'refund:order:' . $order->id . ':item:' . $orderItem->id;
                    $stockService->restorePreparedStock(
                        $item,
                        (int) $orderItem->quantity,
                        $key,
                        $order->id,
                        $request->user()?->id,
                    );
                }
            }

            return [$refund, $order];
        });

        app(AuditLogService::class)->log(
            'refund.created',
            'Refund',
            $refund->id,
            [],
            $refund->toArray(),
            ['order_id' => $order->id],
            $request,
        );

        $refund->load('order');
        event(new OrderRefunded(OrderRefundedData::fromRefund($refund)));

        return response()->json(['refund' => $refund], 201);
    }
}
