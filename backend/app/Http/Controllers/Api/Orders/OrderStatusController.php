<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Orders;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsNotificationSettings;
use App\Domains\Orders\Actions\HoldOrderAction;
use App\Domains\Orders\Actions\ResumeOrderAction;
use App\Domains\Orders\DTOs\OrderCancelledData;
use App\Domains\Orders\Events\OrderCancelled;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\Order;
use App\Models\RestaurantTable;
use App\Models\Variant;
use App\Services\AuditLogService;
use App\Services\OrderStatusMachine;
use App\Services\StockManagementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderStatusController extends Controller
{
    public function hold(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $payload = $request->validate([
            'ticket_name' => 'nullable|string|max:80',
            'ticket_note' => 'nullable|string|max:255',
        ]);

        $order = app(HoldOrderAction::class)->execute($id, $payload, $request);

        return response()->json(['order' => $order]);
    }

    public function resume(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $reprintKitchen = (bool) $request->boolean('reprint_kitchen', false);
        $order = app(ResumeOrderAction::class)->execute($id, $reprintKitchen, $request);

        return response()->json(['order' => $order]);
    }

    /**
     * POST /api/orders/{id}/fire-to-kitchen
     *
     * Sends a held / pending ticket to the kitchen without taking
     * payment. Powers the "Save & Fire" branch of the new POS Save
     * modal: cashier rings up a phone-call pickup, picks "Fire to
     * kitchen now", and the line cook starts cooking immediately while
     * the customer pays via SMS pay link OR at pickup.
     *
     * Held → pending (state machine transition), sets `fired_at`,
     * enqueues a kitchen print job, and — for Pickup orders with an
     * attached customer phone — sends a friendly "Order received"
     * SMS so the customer knows the kitchen has it.
     *
     * Idempotent: calling on an already-fired order is a no-op except
     * the kitchen reprint, which is intentional (cashier can re-fire
     * if the original chit was lost).
     */
    public function fireToKitchen(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $order = DB::transaction(function () use ($id, $request) {
            $order = Order::with('customer')->lockForUpdate()->findOrFail($id);

            // Held tickets walk the state machine back to pending so KDS
            // can see them. Already-pending orders just get fired_at
            // refreshed (cashier asked for a reprint).
            $oldStatus = $order->status;
            if ($order->status === 'held') {
                app(OrderStatusMachine::class)->assertTransitionAllowed($order, 'pending');
                $order->update([
                    'status' => 'pending',
                    'held_at' => null,
                    'fired_at' => $order->fired_at ?? now(),
                ]);
            } elseif (in_array($order->status, ['pending', 'in_progress'], true)) {
                if (!$order->fired_at) {
                    $order->update(['fired_at' => now()]);
                }
            } else {
                abort(422, "Order is {$order->status} and cannot be fired to kitchen.");
            }

            app(AuditLogService::class)->log(
                'order.fired_to_kitchen',
                'Order',
                $order->id,
                ['status' => $oldStatus],
                ['status' => $order->status, 'fired_at' => $order->fired_at],
                [],
                $request,
            );

            return $order->fresh(['customer', 'items.modifiers']);
        });

        // Kitchen print + customer "Order received" SMS run post-commit
        // so a failed enqueue / SMS doesn't roll back the state change.
        DB::afterCommit(function () use ($order, $request): void {
            try {
                app(\App\Services\PrintJobService::class)
                    ->enqueueKitchen($order, reason: 'fire_to_kitchen');
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('fireToKitchen: kitchen print enqueue failed', [
                    'order_id' => $order->id,
                    'error' => $e->getMessage(),
                ]);
            }

            // SMS the customer if this is a Pickup ticket with a phone.
            // Dine-in / Takeaway customers are at the counter — no SMS.
            // Pay link is intentionally NOT auto-included (cashier
            // chooses via the separate "Send pay link" button).
            if ($order->type !== 'online_pickup') {
                return;
            }
            if (!SmsNotificationSettings::isEnabled(SmsNotificationSettings::POS_FIRE_TO_KITCHEN)) {
                return;
            }
            $phone = $order->customer?->phone;
            if (!$phone) {
                return;
            }
            try {
                $orderNum = $order->order_number ?? "#{$order->id}";
                $total = number_format((float) $order->total, 2);
                // First-name only — keeps GSM-7 segment count low and
                // avoids shouting a formal title in casual SMS copy.
                $rawName = trim((string) ($order->customer?->name ?? ''));
                $firstName = $rawName !== '' ? trim(strtok($rawName, ' ')) : '';
                $greeting = $firstName !== '' ? "Hi {$firstName}, order" : 'Order';

                // Mint (or fetch) the public invoice — idempotent, so
                // multiple Fire-to-Kitchen taps don't create duplicates.
                // We use the existing /invoices/{token} public Blade
                // page so the customer can scroll line-items + price
                // before they pay. The "Send pay link" button (future
                // BML wiring) sends a separate, payment-focused SMS.
                $link = null;
                try {
                    $invoice = app(InvoiceController::class)
                        ->createFromOrderInternal($order, $request->user());
                    $link = rtrim(config('app.url'), '/') . '/invoices/' . $invoice->token;
                } catch (\Throwable $e) {
                    \Illuminate\Support\Facades\Log::warning('fireToKitchen: invoice mint failed', [
                        'order_id' => $order->id,
                        'error' => $e->getMessage(),
                    ]);
                }

                if ($link !== null) {
                    $invoiceLine = "View invoice: {$link}";
                } else {
                    $invoiceLine = '';
                }

                $fallback = implode("\n", array_filter([
                    "{$greeting} {$orderNum} received.",
                    "Order total: MVR {$total}",
                    $invoiceLine !== '' ? $invoiceLine : null,
                    "We'll text you when it's ready.",
                ]));

                $message = app(CustomerSmsMessageBuilder::class)->build(
                    CustomerSmsMessageBuilder::SLUG_FIRE_TO_KITCHEN,
                    [
                        'greeting' => $greeting,
                        'order_number' => (string) $orderNum,
                        'total' => $total,
                        'invoice_line' => $invoiceLine,
                    ],
                    $fallback,
                );

                app(SmsService::class)->send(new SmsMessage(
                    to: $phone,
                    message: $message,
                    type: 'pos_fire_to_kitchen',
                    customerId: $order->customer_id,
                    referenceType: 'order',
                    referenceId: (string) $order->id,
                    idempotencyKey: 'order:fired:received:' . $order->id,
                    actingUserId: $request->user()?->id,
                ));
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('fireToKitchen: SMS failed', [
                    'order_id' => $order->id,
                    'error' => $e->getMessage(),
                ]);
            }
        });

        return response()->json(['order' => $order]);
    }

    /**
     * POST /api/orders/{id}/cancel
     *
     * Void a non-terminal order from the POS Active Orders panel.
     *
     * Cancels the ticket, returns deducted POS stock, releases any
     * loyalty / promo / gift-card holds (via OrderCancelled listeners),
     * frees the dine-in table, and writes a full audit row. Refuses to
     * touch paid / refunded / completed / already-cancelled orders —
     * money-touching reversals must go through the refund flow which
     * tracks cash movement, ledger entries, and the like.
     *
     * Request body:
     *   reason (required, max 255) — short note shown in the void
     *                                confirm dialog. Recorded on the
     *                                order itself and in the audit log
     *                                so a manager reviewing the day's
     *                                voids can see why each one was
     *                                pulled.
     *
     * Idempotency: a second call on an already-cancelled order short-
     * circuits with a 200 OK ("unchanged"). Prevents double-restore of
     * stock if the cashier double-taps Void.
     */
    public function cancel(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        // Permission gate — restricts voids to users with the orders.void
        // permission (owner/manager by default, but overridable per-user
        // from Settings → Roles & Permissions). VoidPolicy now routes via
        // HasPermissions so the DB override actually takes effect.
        // Returns 403 with a clear message instead of leaking the policy
        // name, so the POS UI can surface "You're not allowed to void
        // tickets" to the cashier.
        if (!\Illuminate\Support\Facades\Gate::check('order.void')) {
            return response()->json([
                'message' => "You don't have permission to void orders. Ask a manager.",
            ], 403);
        }

        $validated = $request->validate([
            'reason' => 'required|string|max:255',
        ]);

        $result = DB::transaction(function () use ($id, $validated, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);

            if ($order->status === 'cancelled') {
                return ['order' => $order, 'unchanged' => true];
            }

            // Hard-block reversal of money-touching states. Refunding a
            // paid order changes inventory + creates a refund ledger
            // entry + (optionally) returns cash from the drawer — none
            // of which this endpoint does. Force the cashier through
            // the proper refund flow instead of silently voiding their
            // way past it.
            //
            // 'partial' is also blocked here: addPayments sets
            // status='partial' (and payment_status='partial') the moment
            // a cashier takes a split-tender first leg (e.g. MVR 50 cash
            // on a MVR 120 ticket). Without this guard the cashier could
            // void the ticket, restore the stock, and keep the cash off-book.
            $blocked = ['paid', 'completed', 'partial', 'refunded', 'partially_refunded'];
            if (in_array($order->status, $blocked, true)) {
                return ['error' => "Order is {$order->status} — issue a refund instead of voiding."];
            }

            // Belt-and-braces: even if the lifecycle status is still 'pending'
            // (e.g. legacy data from before payment_status was wired up),
            // any confirmed payment row means money has changed hands and
            // void is unsafe. Force the refund flow.
            if (in_array($order->payment_status, ['partial', 'paid'], true)) {
                return ['error' => 'Payment recorded on this order — issue a refund instead of voiding.'];
            }
            $confirmedPaymentExists = $order->payments()
                ->whereIn('status', ['paid', 'completed', 'confirmed'])
                ->exists();
            if ($confirmedPaymentExists) {
                return ['error' => 'Confirmed payments exist on this order — issue a refund instead of voiding.'];
            }

            $machine = app(OrderStatusMachine::class);
            if (!$machine->isAllowed($order->status, 'cancelled')) {
                return ['error' => "Order is {$order->status} and can't be voided."];
            }

            $oldStatus = $order->status;
            $reason = trim($validated['reason']);

            $order->update([
                'status' => 'cancelled',
                'cancellation_reason' => $reason,
                'cancelled_at' => now(),
                'cancelled_by' => $request->user()->id,
            ]);

            // Return deducted POS stock to the shelves. Online orders
            // only RESERVE stock — the existing OrderCancelled listener
            // (ReleasePreparedStockOnCancelListener) handles those. POS
            // orders DEDUCT immediately on create, so we have to walk
            // every line item here and call restorePreparedStock /
            // restoreVariantStock with a dedicated cancel idempotency
            // key (so a future double-cancel of the same order can't
            // double-restore inventory).
            $isPosOrder = !in_array($order->type, ['online_pickup', 'delivery'], true);
            if ($isPosOrder) {
                $stockService = app(StockManagementService::class);
                $order->load('items');
                foreach ($order->items as $orderItem) {
                    $qty = (int) $orderItem->quantity;
                    if ($qty <= 0) {
                        continue;
                    }

                    if ($orderItem->variant_id) {
                        $variant = Variant::find($orderItem->variant_id);
                        if ($variant && $variant->track_stock) {
                            $stockService->restoreVariantStock(
                                $variant,
                                $qty,
                                'pos:cancel:order:' . $order->id . ':variant:' . $orderItem->id,
                                $order->id,
                                $request->user()->id,
                            );
                        }
                        continue;
                    }

                    if (!$orderItem->item_id) {
                        continue;
                    }
                    $item = Item::find($orderItem->item_id);
                    if (!$item || !$item->track_stock || $item->availability_type !== 'stock_based') {
                        continue;
                    }
                    $stockService->restorePreparedStock(
                        $item,
                        $qty,
                        'pos:cancel:order:' . $order->id . ':item:' . $orderItem->id,
                        $order->id,
                        $request->user()->id,
                    );
                }
            }

            // Detach + free the seat so cancelled tickets don't keep the table linked.
            if ($order->restaurant_table_id) {
                $tableId = (int) $order->restaurant_table_id;
                $order->update(['restaurant_table_id' => null]);
                RestaurantTable::syncOccupancy($tableId);
            }

            app(AuditLogService::class)->log(
                'order.cancelled',
                'Order',
                $order->id,
                ['status' => $oldStatus],
                ['status' => 'cancelled', 'reason' => $reason],
                [
                    'source' => 'pos',
                    'cancelled_by_user_id' => $request->user()->id,
                ],
                $request,
            );

            // OrderCancelled fires after commit so promo / loyalty /
            // gift-card holds get released and webhooks dispatched. We
            // already restored POS stock inline above — the listener's
            // releaseForOrder() is a safe no-op when no reservation
            // exists, so no double-restore risk.
            DB::afterCommit(function () use ($order): void {
                OrderCancelled::dispatch(OrderCancelledData::fromOrder($order->fresh()));
            });

            return ['order' => $order];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'order' => $result['order']->fresh(['items', 'customer']),
            'unchanged' => $result['unchanged'] ?? false,
        ]);
    }

    /**
     * POST /api/orders/{id}/start-cooking
     *
     * POS equivalent of KDS "Start Cooking" — moves pending/paid tickets
     * into in_progress so the cashier workflow matches the kitchen display.
     */
    public function startCooking(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $result = DB::transaction(function () use ($id, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);

            if ($order->status === 'in_progress') {
                return ['order' => $order, 'unchanged' => true];
            }

            $machine = app(OrderStatusMachine::class);
            if (!$machine->isAllowed($order->status, 'in_progress')) {
                return ['error' => "Order is {$order->status} and can't be started."];
            }

            $oldStatus = $order->status;
            $updates = ['status' => 'in_progress'];
            if (!$order->fired_at) {
                $updates['fired_at'] = now();
            }
            $order->update($updates);

            app(AuditLogService::class)->log(
                'order.started',
                'Order',
                $order->id,
                ['status' => $oldStatus],
                ['status' => 'in_progress', 'fired_at' => $order->fired_at],
                ['source' => 'pos'],
                $request,
            );

            return ['order' => $order];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'order' => $result['order']->fresh(),
            'unchanged' => $result['unchanged'] ?? false,
        ]);
    }

    /**
     * POST /api/orders/{id}/mark-ready
     *
     * Cashier-callable equivalent of KDS bump. Walks pending /
     * in_progress orders to `ready`, which triggers the existing
     * SendCustomerOrderStatusSmsListener "Ready for pickup!" SMS.
     *
     * Why this exists: cashier-only setups have no KDS terminal in
     * the kitchen, so the lifecycle SMS chain breaks at "Ready". With
     * this endpoint the cashier can move the order from POS once
     * they hear the bell / see the food, and the customer gets the
     * SMS without the kitchen needing extra hardware.
     *
     * Idempotent for already-ready orders (no-op).
     */
    public function markReady(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $result = DB::transaction(function () use ($id, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);

            if ($order->status === 'ready') {
                // Idempotent — cashier double-tapping shouldn't bounce.
                return ['order' => $order, 'unchanged' => true];
            }

            $machine = app(OrderStatusMachine::class);
            if (!$machine->isAllowed($order->status, 'ready')) {
                return ['error' => "Order is {$order->status} and can't be marked ready."];
            }

            // Online-pickup orders are pre-paid by the customer via the
            // online ordering app — if the order somehow reached this
            // status without payment confirmed, refuse to mark ready
            // (the BML webhook hasn't landed yet, so customer would
            // walk out with food the venue hasn't collected on).
            //
            // Takeaway and delivery are EXCLUDED — those are legitimate
            // cash-on-pickup / pay-at-counter / pay-at-door flows. The
            // POS markPickedUp endpoint enforces a final payment check
            // when the food actually leaves with the customer.
            //
            // Dine-in is EXCLUDED — pay-after-meal is the entire model.
            if ($order->type === 'online_pickup'
                && $order->payment_status !== 'paid'
                && $order->status !== 'paid') {
                return ['error' => 'Online order is unpaid — wait for payment confirmation before marking ready.'];
            }

            // Receiving-before-ready is optional (Admin kitchen setting).
            // When enabled it is a soft reminder only — cashiers in small
            // cafés can still mark Ready from POS without waiting on KDS.

            $oldStatus = $order->status;
            $order->update(['status' => 'ready']);

            app(AuditLogService::class)->log(
                'order.ready',
                'Order',
                $order->id,
                ['status' => $oldStatus],
                ['status' => 'ready'],
                // Tagged 'pos' so audit logs distinguish cashier-marked
                // ready from KDS-marked ready. Useful for future
                // analytics ("how often does the cashier override KDS?").
                ['source' => 'pos'],
                $request,
            );

            // OrderStatusChanged event is dispatched by the model
            // observer on status update — that's what fires the
            // existing "Ready for pickup!" SMS, so we don't need to
            // emit anything extra here.

            return ['order' => $order];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'order' => $result['order']->fresh(),
            'unchanged' => $result['unchanged'] ?? false,
        ]);
    }

    /**
     * POST /api/orders/{id}/mark-picked-up
     *
     * Cashier-callable equivalent of KDS complete — physically moves
     * an order to the "done" state. Used when the customer has
     * collected their food. Closes the loyalty/referral loop via
     * OrderCompleted (same event KDS bump fires).
     *
     * GUARDED: refuses to complete an unpaid order. This is a till
     * protection — if the cashier accidentally hits "Picked up" on
     * a phone-order that the customer walked away with without
     * paying, we keep the order visible (in Active orders with the
     * UNPAID badge) so it gets chased down at end-of-day.
     * Override path: take the payment first (cash or Send pay link),
     * then this endpoint will accept the transition.
     */
    public function markPickedUp(Request $request, int $id): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $result = DB::transaction(function () use ($id, $request) {
            $order = Order::lockForUpdate()->findOrFail($id);

            if ($order->payment_status !== 'paid' && $order->status !== 'paid') {
                return ['error' => "Order is {$order->payment_status} — take payment or send pay link before marking picked up."];
            }

            if ($order->status === 'completed') {
                return ['order' => $order, 'unchanged' => true];
            }

            $machine = app(OrderStatusMachine::class);
            if (!$machine->isAllowed($order->status, 'completed')) {
                return ['error' => "Order is {$order->status} and can't be marked picked up."];
            }

            $oldStatus = $order->status;
            $order->update([
                'status' => 'completed',
                'completed_at' => now(),
            ]);

            app(AuditLogService::class)->log(
                'order.completed',
                'Order',
                $order->id,
                ['status' => $oldStatus],
                ['status' => 'completed'],
                ['source' => 'pos'],
                $request,
            );

            $orderForEvent = $order->fresh();
            DB::afterCommit(function () use ($orderForEvent): void {
                \App\Domains\Orders\Events\OrderCompleted::dispatch(
                    \App\Domains\Orders\DTOs\OrderCompletedData::fromOrder($orderForEvent),
                );
            });

            return ['order' => $order];
        });

        if (isset($result['error'])) {
            return response()->json(['message' => $result['error']], 422);
        }

        return response()->json([
            'order' => $result['order']->fresh(),
            'unchanged' => $result['unchanged'] ?? false,
        ]);
    }
}
