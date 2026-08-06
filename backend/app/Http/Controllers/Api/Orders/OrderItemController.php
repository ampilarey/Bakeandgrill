<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Orders;

use App\Domains\Delivery\Services\DeliveryFeeCalculator;
use App\Domains\Orders\DTOs\OrderCancelledData;
use App\Domains\Orders\Events\OrderCancelled;
use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Domains\Orders\Support\EffectiveDiscount;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\RestaurantTable;
use App\Services\AuditLogService;
use App\Services\OrderCreationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderItemController extends Controller
{
    /**
     * True when the order has any real money attached (a confirmed/paid
     * payment row, or a partial payment_status). Merge/split must be refused
     * in that case so items and payments never drift apart.
     */
    private function hasSettledMoney(Order $order): bool
    {
        if ($order->payment_status === 'partial' || $order->payment_status === 'paid') {
            return true;
        }

        return $order->payments()
            ->whereIn('status', ['paid', 'completed', 'confirmed'])
            ->exists();
    }

    /**
     * PATCH /api/orders/{id}/items
     *
     * Replace the full line-item set on an existing active order.
     * Used by the POS "💾 Save changes" button when the cashier edits
     * a resumed parked / cooking / ready ticket.
     *
     * Refuses paid, completed, cancelled, and refunded orders so the
     * cashier can't quietly edit a finalised ticket and skew finance
     * reports. (Edits to an already-charged ticket should go through
     * refunds, not silent rewrites.)
     */
    public function updateItems(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'nullable|integer',
            'items.*.name' => 'required|string|max:255',
            'items.*.quantity' => 'required|numeric|min:0.001',
            'items.*.variant_id' => 'nullable|integer',
            'items.*.packaging_option_id' => 'nullable|integer|exists:item_packaging_options,id',
            'items.*.notes' => 'nullable|string|max:500',
            'items.*.modifiers' => 'nullable|array',
            'items.*.modifiers.*.modifier_id' => 'nullable|integer',
            'items.*.modifiers.*.name' => 'required_with:items.*.modifiers|string|max:255',
            'items.*.modifiers.*.price' => 'required_with:items.*.modifiers|numeric|min:0',
            'reprint_kitchen' => 'nullable|boolean',
            // Optional ticket meta — POS "Save changes" when cashier switches
            // fulfillment mode, table, or delivery address without item edits.
            'type' => 'nullable|string|in:dine_in,takeaway,online_pickup,delivery',
            'restaurant_table_id' => 'nullable|integer|exists:restaurant_tables,id',
            'delivery_address_line1' => 'nullable|string|max:255',
            'delivery_address_line2' => 'nullable|string|max:255',
            'delivery_island' => 'nullable|string|max:100',
            'delivery_contact_name' => 'nullable|string|max:100',
            'delivery_contact_phone' => ['nullable', 'string', 'max:30', 'regex:/^(\+?960)?[379]\d{6}$/'],
            'delivery_notes' => 'nullable|string|max:500',
            'delivery_location_link' => 'nullable|url|max:2048',
            'discount_amount' => 'nullable|numeric|min:0',
            'discount_reason' => 'nullable|string|max:255',
            'discount_reason_note' => 'nullable|string|max:255',
        ]);

        $reprintKitchen = (bool) ($validated['reprint_kitchen'] ?? true);

        $order = DB::transaction(function () use ($id, $validated, $reprintKitchen, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);

            // Block edits to anything that's finalised. Specifically:
            //   paid / completed       — money in the till, can't silently rewrite
            //   cancelled / refunded   — terminal states, must not resurface
            //   payment_pending        — online order awaiting BML confirm, hands off
            $blockedStatuses = ['paid', 'completed', 'cancelled', 'refunded', 'partially_refunded', 'payment_pending'];
            if (in_array($order->status, $blockedStatuses, true)) {
                return ['error' => "Order is {$order->status} and cannot be edited. Refund instead."];
            }
            // Prepaid dine-in (customer paid online, then orders more at the
            // table): the same bill grows and the balance is settled at the
            // end. All other fully-paid tickets stay locked to refunds.
            $isPrepaidDineIn = $order->type === 'dine_in' && $order->user_id === null;
            if ($order->payment_status === 'paid' && !$isPrepaidDineIn) {
                return ['error' => 'Order is fully paid — edits must go through refunds.'];
            }
            $paidFloorLaar = ($order->payment_status === 'paid' || $order->payment_status === 'partial')
                ? app(\App\Domains\Payments\Services\OrderPaymentStateService::class)->paidLaarForOrder($order->id)
                : 0;

            $oldType = (string) $order->type;
            $oldTableId = $order->restaurant_table_id;

            $meta = [];
            $newType = array_key_exists('type', $validated) && $validated['type'] !== null
                ? (string) $validated['type']
                : (string) $order->type;

            // Pass target type + staff user into replace so channel assert
            // uses dine_in/takeaway when leaving delivery (avoids rejecting
            // with "Delivery is paused"), and POS phone-in delivery can
            // ignore the public delivery gate. Stock restore still keys
            // off the prior type inside replaceOrderItems.
            $updated = app(OrderCreationService::class)
                ->replaceOrderItems(
                    $order,
                    $validated['items'],
                    $reprintKitchen,
                    $request->user(),
                    array_key_exists('type', $validated) && $validated['type'] !== null
                        ? $newType
                        : null,
                );

            if (array_key_exists('type', $validated) && $validated['type'] !== null) {
                $meta['type'] = $newType;
                $meta['restaurant_table_id'] = $newType === 'dine_in'
                    ? ($validated['restaurant_table_id'] ?? null)
                    : null;
            } elseif (array_key_exists('restaurant_table_id', $validated) && $newType === 'dine_in') {
                $meta['restaurant_table_id'] = $validated['restaurant_table_id'];
            }

            if ($newType === 'delivery') {
                foreach ([
                    'delivery_address_line1',
                    'delivery_address_line2',
                    'delivery_island',
                    'delivery_contact_name',
                    'delivery_contact_phone',
                    'delivery_notes',
                    'delivery_location_link',
                ] as $field) {
                    if (array_key_exists($field, $validated)) {
                        $meta[$field] = $validated[$field];
                    }
                }

                $island = (string) ($meta['delivery_island'] ?? $updated->delivery_island ?? '');
                if ($island !== '') {
                    $feeLaar = app(DeliveryFeeCalculator::class)->calculateLaar(
                        $island,
                        EffectiveDiscount::discountedSubtotalLaarFromOrder($updated),
                    );
                    $meta['delivery_fee'] = round($feeLaar / 100, 2);
                    $meta['delivery_fee_laar'] = $feeLaar;
                }
            } elseif (array_key_exists('type', $validated) && $validated['type'] !== null) {
                // Leaving delivery — clear address/fee so stale rows don't linger.
                $meta['delivery_address_line1'] = null;
                $meta['delivery_address_line2'] = null;
                $meta['delivery_island'] = null;
                $meta['delivery_contact_name'] = null;
                $meta['delivery_contact_phone'] = null;
                $meta['delivery_notes'] = null;
                $meta['delivery_location_link'] = null;
                $meta['delivery_fee'] = 0;
                $meta['delivery_fee_laar'] = 0;
            }

            if (array_key_exists('discount_amount', $validated)) {
                $discountAmount = (float) ($validated['discount_amount'] ?? 0);
                $subtotalLaar = (int) round(
                    (float) $updated->items()->sum(\DB::raw('total_price')) * 100,
                );
                $requestedLaar = max(0, (int) round($discountAmount * 100));
                $user = $request->user();
                $actor = $user instanceof \App\Models\User ? $user : null;

                $decision = app(\App\Domains\Orders\Services\ManualDiscountPolicy::class)->authorizeAndClamp(
                    $actor,
                    $subtotalLaar,
                    $requestedLaar,
                    isset($validated['discount_reason']) ? (string) $validated['discount_reason'] : null,
                    isset($validated['discount_reason_note']) ? (string) $validated['discount_reason_note'] : null,
                    (int) $updated->id,
                    null,
                    viaApprovalConfirm: false,
                    request: $request,
                );

                $meta['manual_discount_laar'] = $decision->discountLaar;
                $meta['manual_discount_reason'] = $decision->reason;
                $meta['manual_discount_reason_note'] = $decision->reasonNote;
                $meta['manual_discount_approved_by'] = $decision->approvedByUserId;
            }

            if ($meta !== []) {
                $updated->update($meta);
                $updated = app(OrderTotalsCalculator::class)
                    ->recalculateAndPersist($updated->fresh(['items.item']));
            }

            // Floor map: seat ownership follows restaurant_table_id.
            // Only claim when the table id actually changes — split tickets
            // share one seat, and re-claiming on every item save would 422.
            $newTableId = $updated->restaurant_table_id !== null
                ? (int) $updated->restaurant_table_id
                : null;
            $prevTableId = $oldTableId !== null ? (int) $oldTableId : null;
            if ($prevTableId !== null && $prevTableId !== $newTableId) {
                RestaurantTable::syncOccupancy($prevTableId);
            }
            if (
                $newTableId !== null
                && (string) $updated->type === 'dine_in'
                && $prevTableId !== $newTableId
            ) {
                RestaurantTable::claimForOrder($newTableId, (int) $updated->id);
            }

            // Prepaid dine-in same-bill rule: the ticket may grow (add-ons)
            // but never shrink below what the customer already paid — money
            // going back out is a refund, with its own audit trail.
            if ($paidFloorLaar > 0) {
                $newTotalLaar = (int) ($updated->total_laar ?? round((float) $updated->total * 100));
                if ($newTotalLaar < $paidFloorLaar) {
                    abort(422, sprintf(
                        'Order total (MVR %s) cannot go below the amount already paid (MVR %s). Process a refund instead.',
                        number_format($newTotalLaar / 100, 2),
                        number_format($paidFloorLaar / 100, 2),
                    ));
                }
                // Paid → partial when add-ons raise the total past payments.
                app(\App\Domains\Payments\Services\OrderPaymentStateService::class)
                    ->syncPaymentStatus($updated);
            }

            app(AuditLogService::class)->log(
                'order.items_replaced',
                'Order',
                $updated->id,
                [
                    'type' => $oldType,
                    'restaurant_table_id' => $oldTableId,
                ],
                [
                    'item_count' => count($validated['items']),
                    'reprint_kitchen' => $reprintKitchen,
                    'new_total' => $updated->total,
                    'type' => $updated->type,
                    'restaurant_table_id' => $updated->restaurant_table_id,
                ],
                ['source' => 'pos'],
                $request,
            );

            return ['order' => $updated];
        });

        if (isset($order['error'])) {
            return response()->json(['message' => $order['error']], 422);
        }

        $fresh = $order['order']->fresh(['items.modifiers', 'customer']);

        return response()->json([
            'order' => [
                'id' => $fresh->id,
                'total' => (float) $fresh->total,
                'subtotal' => (float) $fresh->subtotal,
                'tax_amount' => (float) $fresh->tax_amount,
                'type' => $fresh->type,
                'restaurant_table_id' => $fresh->restaurant_table_id,
            ],
        ]);
    }

    /**
     * POST /api/orders/{id}/merge { source_id }
     *
     * Consolidate two open tickets — items from `source_id` are
     * re-parented onto the URL order; source is then cancelled with
     * a "merged into" audit trail. Both orders must be in editable
     * states (not paid / completed / cancelled / refunded). The
     * target order keeps its own customer, table, and order type.
     */
    public function merge(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $validated = $request->validate([
            'source_id' => 'required|integer|different:' . $id,
        ]);

        $result = DB::transaction(function () use ($id, $validated, $request) {
            $target = Order::lockForUpdate()->findOrFail($id);
            $source = Order::lockForUpdate()->findOrFail($validated['source_id']);

            $blocked = ['paid', 'completed', 'cancelled', 'refunded', 'partially_refunded', 'payment_pending'];
            if (in_array($target->status, $blocked, true) || $target->payment_status === 'paid') {
                return ['error' => "Target order is {$target->status} — can't merge into it."];
            }
            if (in_array($source->status, $blocked, true) || $source->payment_status === 'paid') {
                return ['error' => "Source order is {$source->status} — can't merge from it."];
            }
            // 2026-08 audit #4: merging moves items but leaves payments on the
            // (soon-cancelled) source, breaking the item↔money link. Refuse
            // whenever either ticket already has any confirmed/partial money.
            if ($this->hasSettledMoney($target)) {
                return ['error' => "Target order has payments — settle or refund before merging."];
            }
            if ($this->hasSettledMoney($source)) {
                return ['error' => "Source order has payments — settle or refund before merging."];
            }

            // Re-parent items. Modifiers travel with their items
            // because OrderItemModifier.order_item_id stays the same.
            OrderItem::where('order_id', $source->id)
                ->update(['order_id' => $target->id]);

            // Recalculate target totals via the calculator (single
            // source of truth — taxes/discounts/etc. all reapply).
            $target = app(OrderCreationService::class)
                ->recalculateTotals($target->fresh());

            // Cancel the source so it disappears from Active orders.
            $sourceOldStatus = $source->status;
            $source->update([
                'status' => 'cancelled',
                'ticket_note' => trim(($source->ticket_note ? $source->ticket_note . ' · ' : '') . "Merged into order #{$target->id}"),
            ]);

            app(AuditLogService::class)->log(
                'order.merged',
                'Order',
                $target->id,
                ['target_status' => $target->status],
                ['source_id' => $source->id, 'new_total' => $target->total],
                ['source' => 'pos'],
                $request,
            );
            app(AuditLogService::class)->log(
                'order.merged_into',
                'Order',
                $source->id,
                ['status' => $sourceOldStatus],
                ['status' => 'cancelled', 'merged_into_id' => $target->id],
                ['source' => 'pos'],
                $request,
            );

            return ['order' => $target, 'source' => $source];
        });

        // Fire OrderCancelled for the source AFTER commit so loyalty /
        // promo / gift-card holds, reservation cleanup, and webhook
        // dispatches all run for the merged-away ticket. Previously the
        // source was silently flipped to 'cancelled' without firing the
        // event, leaving holds tied to a ticket that no longer existed
        // (loyalty points couldn't be re-redeemed until the hold expired,
        // gift cards stayed "in use").
        if (isset($result['source'])) {
            $sourceOrder = $result['source']->fresh();
            DB::afterCommit(function () use ($sourceOrder): void {
                OrderCancelled::dispatch(OrderCancelledData::fromOrder($sourceOrder));
            });
        }

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'order' => [
                'id' => $result['order']->id,
                'total' => (float) $result['order']->total,
            ],
        ]);
    }

    /**
     * POST /api/orders/{id}/split { item_ids: [...] }
     *
     * Split selected items off the URL order into a brand-new order.
     * Returns both the slimmed source and the new split order. The
     * split inherits the source's type and customer (split bills
     * usually keep the same party) but starts a fresh order_number.
     *
     * Same editable-state guards as merge.
     */
    public function split(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $validated = $request->validate([
            'item_ids' => 'required|array|min:1',
            'item_ids.*' => 'integer',
        ]);

        $result = DB::transaction(function () use ($id, $validated, $request) {
            $source = Order::lockForUpdate()->with('items')->findOrFail($id);

            $blocked = ['paid', 'completed', 'cancelled', 'refunded', 'partially_refunded', 'payment_pending'];
            if (in_array($source->status, $blocked, true) || $source->payment_status === 'paid') {
                return ['error' => "Order is {$source->status} — can't split."];
            }
            // 2026-08 audit #4: splitting moves items to a fresh unpaid order
            // while payments stay on the source — refuse once money is attached.
            if ($this->hasSettledMoney($source)) {
                return ['error' => "Order has payments — settle or refund before splitting."];
            }

            $candidateIds = $source->items->pluck('id')->all();
            $toSplit = array_values(array_intersect($validated['item_ids'], $candidateIds));
            if (empty($toSplit)) {
                return ['error' => 'None of the supplied items belong to this order.'];
            }
            if (count($toSplit) === count($candidateIds)) {
                return ['error' => 'Splitting every item would leave the source empty. Just charge the source instead.'];
            }

            // Mint a sibling order with the source's context but zero
            // items, then reparent the chosen items onto it.
            $split = app(OrderCreationService::class)->createFromPayload([
                'type' => $source->type,
                'restaurant_table_id' => $source->restaurant_table_id,
                'customer_id' => $source->customer_id,
                'items' => [],
                'print' => false,
                'ticket_name' => $source->ticket_name ? "{$source->ticket_name} (split)" : null,
                'ticket_note' => "Split from order #{$source->id}",
            ], $request->user());

            OrderItem::whereIn('id', $toSplit)->update(['order_id' => $split->id]);

            $service = app(OrderCreationService::class);
            $source = $service->recalculateTotals($source->fresh());
            $split = $service->recalculateTotals($split->fresh());

            app(AuditLogService::class)->log(
                'order.split',
                'Order',
                $source->id,
                [],
                ['split_into_id' => $split->id, 'item_count' => count($toSplit)],
                ['source' => 'pos'],
                $request,
            );

            return ['source' => $source, 'split' => $split];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'source' => ['id' => $result['source']->id, 'total' => (float) $result['source']->total],
            'split' => ['id' => $result['split']->id, 'total' => (float) $result['split']->total],
        ]);
    }
}
