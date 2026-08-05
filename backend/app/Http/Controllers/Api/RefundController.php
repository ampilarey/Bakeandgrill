<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Finance\Services\RefundDrawerCashService;
use App\Domains\Menu\Services\ComboChildStockService;
use App\Domains\Orders\DTOs\OrderRefundedData;
use App\Domains\Orders\Events\OrderRefunded;
use App\Domains\Payments\Repositories\PaymentRepositoryInterface;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRefundRequest;
use App\Models\Order;
use App\Models\Refund;
use App\Services\AuditLogService;
use App\Services\OrderStatusTransitionService;
use App\Services\ShiftAccessService;
use App\Services\StockManagementService;
use App\Services\StockReservationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class RefundController extends Controller
{
    public function __construct(
        private readonly PaymentRepositoryInterface $payments,
        private readonly RefundDrawerCashService $drawerCash,
    ) {}

    public function index(Request $request)
    {
        Gate::authorize('refund.process');

        $allowedStatuses = ['pending', 'approved', 'rejected', 'processed'];
        $query = Refund::with(['order', 'user'])->orderByDesc('created_at');

        if ($request->filled('status') && in_array($request->query('status'), $allowedStatuses, true)) {
            $query->where('status', $request->query('status'));
        }

        $paginator = $query->paginate(50);

        $approvedStatuses = ['approved', 'processed'];

        return response()->json([
            'refunds' => $paginator,
            'meta' => [
                'approved_amount_total' => (float) Refund::whereIn('status', $approvedStatuses)->sum('amount'),
            ],
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
        $processorShift = app(ShiftAccessService::class)->requireOpenShift(
            $request->user(),
            'Open a shift before processing a refund.',
        );

        $cashOverride = (bool) ($validated['cash_refund_override'] ?? false);

        [$refund, $order, $refundRatio, $breakdown] = DB::transaction(function () use ($validated, $amount, $amountLaar, $orderId, $request, $processorShift, $cashOverride) {
            $order = Order::with(['items.item', 'items.variant'])->lockForUpdate()->findOrFail($orderId);

            $orderTotalLaar = (int) ($order->total_laar ?? round((float) ($order->total ?? 0) * 100));

            // Cap refunds against the amount the customer ACTUALLY PAID, not the
            // order total. A partially-paid order (e.g. MVR 50 collected on a
            // MVR 100 ticket) must never refund more than MVR 50.
            //
            // Canonical paid sum — per-row COALESCE via PaymentRepository.
            $paidLaar = $this->payments->sumAmountLaarForOrder(
                $order->id,
                ['paid', 'completed', 'confirmed'],
            );

            // Aggregate prior refunds in integer laari to avoid float-precision
            // off-by-cent rejections on long refund histories. ROUND on the
            // way in pins each row to a whole cent before SUMming.
            $alreadyRefundedLaar = (int) $order->refunds()
                ->where('status', '!=', 'rejected')
                ->selectRaw('COALESCE(SUM(ROUND(amount * 100)), 0) as total_laar')
                ->value('total_laar');

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

            // Gift-card purchases can only be refunded in full — the purchased
            // card is voided in one step by the OrderRefunded listener, and
            // partially reversing a "purchase to a stored balance" tender has
            // no sensible ledger semantics.
            if (($order->type ?? '') === 'gift_card'
                && $refundableLaar > 0
                && $amountLaar + $alreadyRefundedLaar < $refundableLaar) {
                abort(422, 'Gift card purchases can only be refunded in full.');
            }

            // FIX 1: compute the actual "money out of drawer" split so
            // shift reconciliation isn't blown up by a credit-account / gift
            // card / wallet reversal that never touched the till.
            $breakdown = $this->drawerCash->breakdown(
                $order,
                $amountLaar,
                $paidLaar,
                $orderTotalLaar,
            );

            $nonCashFloor = $breakdown['credit_reversed_laar']
                + $breakdown['gift_reversed_laar']
                + $breakdown['wallet_reversed_laar'];

            $drawerLaar = $cashOverride
                // Cash-refund override: cashier absorbs any external tender
                // (card / bml / bank_transfer / cheque / etc.) as if the
                // customer walked out with cash from the till. Credit /
                // gift / wallet are still ledger reversals, not cash.
                ? max(0, $amountLaar - $nonCashFloor)
                : $breakdown['default_drawer_cash_out_laar'];

            // Clamp: 0 ≤ drawer ≤ refund − (credit + gift + wallet)
            $drawerLaar = max(0, min($drawerLaar, $amountLaar - $nonCashFloor));

            $refund = Refund::create([
                'order_id' => $order->id,
                'user_id' => $request->user()?->id,
                'shift_id' => $processorShift->id,
                'amount' => $amount,
                'drawer_cash_out_laar' => $drawerLaar,
                'status' => 'approved',
                'reason' => $validated['reason'] ?? null,
            ]);

            $breakdown['drawer_cash_out_laar'] = $drawerLaar;
            $breakdown['cash_refund_override'] = $cashOverride;

            // "Full refund" = refunding everything that was actually collected
            // (matches the cap above). Restoring stock for items the customer
            // never paid for would be wrong.
            $isFullRefund = ($amountLaar + $alreadyRefundedLaar >= $refundableLaar) && $refundableLaar > 0;

            // Fraction of the paid ticket this refund represents — used to
            // restore prepared/variant stock proportionally on partial refunds.
            $thisRefundRatio = $refundableLaar > 0
                ? min(1.0, $amountLaar / $refundableLaar)
                : 0.0;

            // Partial refunds now flip the order to `partially_refunded` instead
            // of leaving it as `paid`. Reports + receipt summaries downstream
            // can short-circuit on this status to render the right thing.
            $transitions = app(OrderStatusTransitionService::class);
            if ($isFullRefund) {
                // Cancelled tickets stay cancelled — refund row still records the money out.
                if (!in_array($order->status, ['cancelled', 'refunded'], true)) {
                    $transitions->transition($order, 'refunded');
                }
            } elseif ($amountLaar > 0) {
                // Don't override a more terminal state (cancelled / refunded).
                if (!in_array($order->status, ['cancelled', 'refunded'], true)) {
                    $transitions->transition($order, 'partially_refunded');
                }
            }

            if ($isFullRefund || ($amountLaar > 0 && $thisRefundRatio > 0)) {
                $stockService = app(StockManagementService::class);
                $comboStock = app(ComboChildStockService::class);
                $order->loadMissing(['items.item.comboItems.item', 'items.variant']);
                foreach ($order->items as $orderItem) {
                    $item = $orderItem->item;
                    if (!$item) {
                        continue;
                    }

                    $lineQty = (int) $orderItem->quantity;
                    $restoreQty = $isFullRefund
                        ? $lineQty
                        : max(0, (int) floor($lineQty * $thisRefundRatio));
                    if ($restoreQty <= 0) {
                        continue;
                    }

                    // Variant-level stock takes priority when the variant tracks
                    // its own inventory (mirrors the deduction logic in OrderCreationService).
                    $variant = $orderItem->variant;
                    if ($variant && $variant->track_stock) {
                        if ($stockService->wasPreparedStockDeductedForLine($order->id, $orderItem->id)) {
                            $key = 'refund:order:' . $order->id . ':variant:' . $orderItem->id
                                . ($isFullRefund ? '' : ':partial:' . $refund->id);
                            $stockService->restoreVariantStock(
                                $variant,
                                $restoreQty,
                                $key,
                                $order->id,
                                $request->user()?->id,
                            );
                        }
                    } elseif ($item->track_stock && $item->availability_type === 'stock_based') {
                        if ($stockService->wasPreparedStockDeductedForLine($order->id, $orderItem->id)) {
                            $key = 'refund:order:' . $order->id . ':item:' . $orderItem->id
                                . ($isFullRefund ? '' : ':partial:' . $refund->id);
                            $stockService->restorePreparedStock(
                                $item,
                                $restoreQty,
                                $key,
                                $order->id,
                                $request->user()?->id,
                            );
                        }
                    }

                    // Combo children are ADDITIONAL — restore when those child
                    // sale movements exist, even if the combo SKU itself does not track stock.
                    $comboStock->restoreForOrderItem(
                        $item,
                        $orderItem,
                        $restoreQty,
                        $lineQty,
                        fn ($child) => $comboStock->refundKey(
                            (int) $order->id,
                            (int) $orderItem->id,
                            (int) $child->id,
                            $isFullRefund,
                            (int) $refund->id,
                        ),
                        (int) $order->id,
                        $request->user()?->id,
                        onlyIfPreviouslyDeducted: true,
                    );
                }
            }

            if (in_array($order->type, ['online_pickup', 'delivery'], true)) {
                app(StockReservationService::class)->releaseForOrder($order->id);
            }

            return [$refund, $order, $thisRefundRatio, $breakdown];
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
        event(new OrderRefunded(OrderRefundedData::fromRefund($refund, $refundRatio)));

        return response()->json([
            'refund' => $refund,
            'breakdown' => [
                'credit_reversed_laar' => $breakdown['credit_reversed_laar'],
                'credit_reversed_mvr' => round($breakdown['credit_reversed_laar'] / 100, 2),
                'gift_reversed_laar' => $breakdown['gift_reversed_laar'],
                'wallet_reversed_laar' => $breakdown['wallet_reversed_laar'],
                'gift_wallet_reversed_laar' => $breakdown['gift_reversed_laar'] + $breakdown['wallet_reversed_laar'],
                'gift_wallet_reversed_mvr' => round(
                    ($breakdown['gift_reversed_laar'] + $breakdown['wallet_reversed_laar']) / 100,
                    2,
                ),
                'external_tender_laar' => $breakdown['external_tender_laar'],
                'external_tender_mvr' => round($breakdown['external_tender_laar'] / 100, 2),
                'drawer_cash_out_laar' => $breakdown['drawer_cash_out_laar'],
                'drawer_cash_out_mvr' => round($breakdown['drawer_cash_out_laar'] / 100, 2),
                'cash_refund_override' => $breakdown['cash_refund_override'],
            ],
        ], 201);
    }
}
