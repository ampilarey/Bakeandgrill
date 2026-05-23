<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Domains\Orders\DTOs\OrderCreatedData;
use App\Domains\Orders\Events\OrderCreated;
use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderItemModifier;
use App\Models\Shift;
use Illuminate\Support\Facades\DB;

class OrderCreationService
{
    public function __construct(
        private OrderTotalsCalculator $calculator,
        private KitchenMenuResolver $kitchenMenuResolver,
    ) {}

    public function createFromPayload(array $payload, ?object $user): Order
    {
        $device = null;
        // Prefer the payload identifier when supplied (explicit), but
        // fall back to the X-Device-Identifier header set by every POS
        // request. Without the fallback an order created via a flow
        // that doesn't echo device_identifier in the body (older POS
        // builds, retried offline syncs) sailed past the
        // EnsureActiveDevice middleware but stored device_id=null —
        // breaking per-station Active Orders attribution and shift
        // anchoring against the device's open shift.
        $identifier = $payload['device_identifier'] ?? null;
        if (empty($identifier) && request() !== null) {
            $headerIdentifier = request()->header('X-Device-Identifier');
            if ($headerIdentifier !== null && $headerIdentifier !== '') {
                $identifier = (string) $headerIdentifier;
            }
        }
        if (!empty($identifier)) {
            $device = Device::where('identifier', $identifier)->first();
        }

        // Anchor the order to the cashier's currently-open shift so the
        // close-shift cash drawer reconciliation includes it. Resolved by
        // (cashier user) first, falling back to device. Customer online
        // orders intentionally have no shift_id (no cashier responsible).
        // Offline sync passes an explicit shift_id from the cached snapshot.
        $shiftId = !empty($payload['shift_id']) ? (int) $payload['shift_id'] : null;
        if ($shiftId === null && $user !== null) {
            $shiftId = Shift::query()
                ->where('user_id', $user->id)
                ->whereNull('closed_at')
                ->latest('opened_at')
                ->value('id');
        }

        // Customer online orders (no staff user, type online_pickup/delivery) must start as
        // payment_pending so the KDS never shows them before payment is confirmed.
        // Kitchen print is also suppressed here — it fires via DispatchKitchenPrintListener
        // on the OrderPaid event once BML/zero-balance confirms the payment.
        $isCustomerOnlineOrder = $user === null
            && in_array($payload['type'] ?? '', ['online_pickup', 'delivery'], true);

        $initialStatus = $isCustomerOnlineOrder ? 'payment_pending' : 'pending';

        $printKitchen = $isCustomerOnlineOrder
            ? false
            : (!array_key_exists('print', $payload) || $payload['print'] === true);

        // `fired_at` records when the kitchen actually saw the ticket.
        // It is set whenever we're going to print to the kitchen at
        // create time. Held tickets (created with print=false then
        // immediately POST /orders/{id}/hold) leave it NULL — they
        // get a `fired_at` only when a later /fire-to-kitchen call
        // moves them out of held. This lets Open Tickets distinguish
        // "parked, kitchen has no idea" from "cooking, awaiting payment".
        $firedAt = $printKitchen ? now() : null;

        return DB::transaction(function () use ($payload, $user, $device, $shiftId, $printKitchen, $initialStatus, $firedAt): Order {
            $order = Order::create([
                'order_number' => $this->generateOrderNumber(),
                'type' => $payload['type'],
                'status' => $initialStatus,
                // `payment_status` is computed by OrderController::addPayments
                // whenever payments are applied. At create time everything
                // starts as unpaid (the migration default also handles
                // backfill); the only exception is a zero-total order
                // (fully discount-covered or comp) which we leave as
                // unpaid until addPayments runs — keeps one source of truth.
                'payment_status' => 'unpaid',
                'fired_at' => $firedAt,
                'restaurant_table_id' => $payload['restaurant_table_id'] ?? null,
                'customer_id' => $payload['customer_id'] ?? null,
                'user_id' => $user?->id,
                'device_id' => $device?->id,
                'shift_id' => $shiftId,
                'ticket_name' => $payload['ticket_name'] ?? null,
                'ticket_note' => $payload['ticket_note'] ?? null,
                // Persist offline sync idempotency key (if supplied). Without
                // this, OfflineSyncController's `where('offline_id', $id)`
                // check never matched a previously-synced order so retries
                // created duplicates.
                'offline_id' => $payload['offline_id'] ?? null,
                'offline_local_number' => $payload['offline_local_number'] ?? null,
                'subtotal' => 0,
                'tax_amount' => 0,
                'discount_amount' => 0,
                'total' => 0,
                'notes' => $payload['notes'] ?? null,
                'customer_notes' => $payload['customer_notes'] ?? null,
            ]);

            $this->addOrderItems($order, $payload['items'] ?? [], $user, !empty($payload['offline_sync']));

            // Convert any payload-level manual discount to laari and store it so
            // the calculator (single source of truth) can include it correctly.
            // The calculator applies discounts BEFORE tax, matching the intended
            // business rule (tax on discounted price, not gross price).
            $discountAmount = (float) ($payload['discount_amount'] ?? 0);
            $subtotalLaar = (int) round(
                $order->items()->sum(\DB::raw('total_price')) * 100,
            );
            $discountLaar = max(0, min((int) round($discountAmount * 100), $subtotalLaar));

            // Persist the discount field first so recalculateAndPersist can read it.
            $order->update(['manual_discount_laar' => $discountLaar]);

            // Use OrderTotalsCalculator as the single source of truth for every
            // totals field (subtotal_laar, tax_laar, total_laar, total, etc.).
            $order = $this->calculator->recalculateAndPersist($order);

            // Enforce minimum order value (not applicable to dine-in)
            $minOrderMvr = (float) config('ordering.minimum_order_mvr', 0);
            if ($minOrderMvr > 0 && $order->total < $minOrderMvr && ($payload['type'] ?? '') !== 'dine_in') {
                abort(422, 'Minimum order amount is MVR ' . number_format($minOrderMvr, 2));
            }

            $order->load(['items.modifiers']);

            DB::afterCommit(function () use ($order, $payload, $printKitchen): void {
                OrderCreated::dispatch(OrderCreatedData::fromOrder($order->fresh(), $printKitchen));

                // Unified customer history: update last_order_at regardless of POS vs online.
                // storeCustomer() does this inline; for POS staff-created orders with a
                // customer_id we mirror the same update so the customer's profile stays current.
                if (!empty($payload['customer_id'])) {
                    Customer::where('id', $payload['customer_id'])
                        ->update(['last_order_at' => now()]);
                }
            });

            return $order;
        });
    }

    public function addItemsToOrder(Order $order, array $items, bool $print = true): Order
    {
        $updated = DB::transaction(function () use ($order, $items): Order {
            $this->addOrderItems($order, $items);

            return $this->calculator->recalculateAndPersist($order);
        });

        // Online orders never print at the kitchen from this path (kitchen
        // ticket fires from OrderPaid for online/delivery channels). For
        // dine-in/takeaway, when the caller asked for kitchen printing
        // (admin "Add Items to Table" defaults to true), enqueue a fresh
        // kitchen ticket so the line cook sees the new lines. Without
        // this hop, $print was accepted on every call but silently
        // ignored — the new items appeared on the bill but never on the
        // kitchen station.
        if ($print && !in_array($updated->type, ['online_pickup', 'delivery'], true)) {
            DB::afterCommit(function () use ($updated): void {
                try {
                    app(PrintJobService::class)
                        ->enqueueKitchen($updated->fresh(['items.modifiers']), 'addItems');
                } catch (\Throwable $e) {
                    logger()->warning('addItemsToOrder: kitchen print enqueue failed', [
                        'order_id' => $updated->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            });
        }

        return $updated;
    }

    public function recalculateTotals(Order $order): Order
    {
        return $this->calculator->recalculateAndPersist($order);
    }

    /**
     * Replace ALL line items on an existing order with the supplied
     * payload, recalculate totals, and optionally reprint the kitchen
     * chit. Used by the POS "Save changes" button when a cashier edits
     * a resumed active ticket — the only mutation path that wipes
     * existing OrderItems wholesale instead of appending.
     *
     * Soft-deletes the prior items (OrderItem uses SoftDeletes via the
     * standard observer pattern) so the audit trail still shows what
     * the kitchen was originally asked to make. The new lines are
     * created with the same KitchenMenuResolver / price-snapshot logic
     * as createFromPayload so taxes / variants / modifiers stay in
     * sync with the menu-as-it-stands-now.
     *
     * Caller MUST hold a row lock on the order before invoking this
     * (we don't lock inside because the controller already does, and
     * we want a single source of truth for the lock window).
     */
    public function replaceOrderItems(Order $order, array $items, bool $reprintKitchen = true): Order
    {
        $updated = DB::transaction(function () use ($order, $items): Order {
            // Restore POS-deducted stock BEFORE soft-deleting the old lines,
            // otherwise the subsequent addOrderItems re-deducts and we leak
            // inventory on every "Save changes" tap. Online orders only
            // RESERVE stock (released elsewhere by ReleasePreparedStockOnCancelListener
            // when the order is cancelled, never on edit) so we skip them
            // here — mirroring the POS-vs-online split in addOrderItems.
            //
            // Idempotency key derived from the OLD order_item id so a
            // repeated edit of the same line can't double-restore. The
            // re-add path uses keys based on the NEW order_item id, so
            // restore + re-deduct keys never collide.
            $isPosOrder = !in_array($order->type, ['online_pickup', 'delivery'], true);
            if ($isPosOrder) {
                $stockService = app(StockManagementService::class);
                $existingItems = $order->items()->get();
                foreach ($existingItems as $existing) {
                    $qty = (int) $existing->quantity;
                    if ($qty <= 0) {
                        continue;
                    }

                    if ($existing->variant_id) {
                        $variant = \App\Models\Variant::find($existing->variant_id);
                        if ($variant && $variant->track_stock) {
                            $stockService->restoreVariantStock(
                                $variant,
                                $qty,
                                'pos:edit:order:' . $order->id . ':variant_item:' . $existing->id,
                                $order->id,
                                null,
                            );
                        }
                        continue;
                    }

                    if (!$existing->item_id) {
                        continue;
                    }
                    $item = Item::find($existing->item_id);
                    if (!$item || !$item->track_stock || $item->availability_type !== 'stock_based') {
                        continue;
                    }
                    $stockService->restorePreparedStock(
                        $item,
                        $qty,
                        'pos:edit:order:' . $order->id . ':item:' . $existing->id,
                        $order->id,
                        null,
                    );
                }
            }

            // Soft-delete current modifiers + items. We don't hard-delete
            // because finance reports and refund flows still want to be
            // able to surface the original ticket if asked.
            $existingItemIds = $order->items()->pluck('id');
            if ($existingItemIds->isNotEmpty()) {
                OrderItemModifier::whereIn('order_item_id', $existingItemIds)->delete();
                OrderItem::whereIn('id', $existingItemIds)->delete();
            }

            // Detach the previous fresh() relations so addOrderItems
            // sees a clean slate when it re-runs.
            $order->setRelation('items', collect());

            $this->addOrderItems($order, $items);

            return $this->calculator->recalculateAndPersist($order);
        });

        if ($reprintKitchen && !in_array($updated->type, ['online_pickup', 'delivery'], true)) {
            // Reprint outside the transaction so a queue/printer hiccup
            // doesn't roll back the cashier's edit.
            DB::afterCommit(function () use ($updated): void {
                try {
                    app(PrintJobService::class)
                        ->enqueueKitchen($updated->fresh(['items.modifiers']), 'replaceItems');
                } catch (\Throwable $e) {
                    logger()->warning('replaceOrderItems: kitchen reprint enqueue failed', [
                        'order_id' => $updated->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            });
        }

        return $updated;
    }

    private function addOrderItems(Order $order, array $items, ?object $user = null, bool $offlineSync = false): float
    {
        $subtotal = 0;

        $isOnlineOrder = in_array($order->type, ['online_pickup', 'delivery'], true);

        // Pre-load all referenced items in a single query to avoid N+1
        $itemIds = array_column($items, 'item_id');
        $itemMap = Item::with(['variants', 'modifiers'])
            ->where('is_active', true)
            ->where('is_available', true)
            ->whereIn('id', $itemIds)
            ->get()
            ->keyBy('id');

        $this->kitchenMenuResolver->assertLineItemsAllowedForOrderType(
            $itemMap->all(),
            $items,
            $order->type,
        );

        foreach ($items as $itemPayload) {
            $itemId = $itemPayload['item_id'];
            $itemModel = $itemMap->get($itemId);

            if (!$itemModel) {
                abort(422, "Item {$itemId} not found or unavailable");
            }

            $quantity = (int) $itemPayload['quantity'];

            // ── Variant resolution ────────────────────────────────────────────
            $variantId = $itemPayload['variant_id'] ?? null;
            $variant = null;

            if ($itemModel->has_variants) {
                // Variant selection is mandatory for variant products
                if (!$variantId) {
                    abort(422, "Please select a size/option for \"{$itemModel->name}\".");
                }

                $variant = $itemModel->variants()->where('id', $variantId)->first();
                if (!$variant) {
                    abort(422, "Variant {$variantId} does not belong to item {$itemId}.");
                }
                if (!$variant->is_active) {
                    abort(422, "The selected option \"{$variant->name}\" for \"{$itemModel->name}\" is no longer available.");
                }
            } elseif ($variantId) {
                // Non-variant product: validate if a variant was still passed
                $variant = $itemModel->variants()->where('id', $variantId)->first();
                if (!$variant) {
                    abort(422, "Variant {$variantId} not found for item {$itemId}.");
                }
                if (!$variant->is_active) {
                    abort(422, "The selected option \"{$variant->name}\" for \"{$itemModel->name}\" is no longer available.");
                }
            }

            $basePrice = isset($itemPayload['unit_price'])
                ? (float) $itemPayload['unit_price']
                : ($variant ? (float) $variant->price : (float) $itemModel->base_price);
            $variantName = $variant?->name;

            // ── Stock check ───────────────────────────────────────────────────
            // Variant-level stock takes priority when the variant tracks its own stock.
            // Offline sync skips availability abort (Policy A) but still deducts below.
            if (!$offlineSync) {
                if ($variant && $variant->track_stock) {
                    $lockedVariant = \App\Models\Variant::lockForUpdate()->find($variant->id) ?? $variant;
                    $available = app(StockReservationService::class)->getAvailableVariantStock($lockedVariant);
                    if ($available < $quantity) {
                        abort(422, "Insufficient stock for \"{$itemModel->name} - {$variant->name}\". Available: {$available}, requested: {$quantity}");
                    }
                } elseif ($itemModel->track_stock && $itemModel->availability_type === 'stock_based') {
                    // Fall back to item-level stock for simple (non-variant-tracking) products
                    $lockedItem = Item::lockForUpdate()->find($itemModel->id) ?? $itemModel;
                    $available = app(StockReservationService::class)->getAvailableStock($lockedItem);
                    if ($available < $quantity) {
                        abort(422, "Insufficient stock for {$lockedItem->name}. Available: {$available}, requested: {$quantity}");
                    }
                }
            }

            $lockedItem = $itemModel;

            $modifierTotal = 0;

            // `notes` is a free-form per-line string the POS uses for
            // kitchen instructions ("No salt", "Extra spicy", etc.).
            // We trim and cap defensively even though StoreOrderRequest
            // already enforces the 255-char limit, because this method
            // is also called from internal flows that may bypass the
            // FormRequest validation.
            $notes = isset($itemPayload['notes']) && is_string($itemPayload['notes'])
                ? mb_substr(trim($itemPayload['notes']), 0, 255)
                : null;
            if ($notes === '') {
                $notes = null;
            }

            $orderItem = OrderItem::create([
                'order_id' => $order->id,
                'item_id' => $itemModel->id,
                'variant_id' => $variantId,
                'item_name' => $itemModel->name,
                'variant_name' => $variantName,
                'quantity' => $quantity,
                'unit_price' => $basePrice,
                'total_price' => 0,
                'tax_rate' => (float) $itemModel->tax_rate,
                'notes' => $notes,
                'status' => 'pending',
            ]);

            // POS only: deduct stock immediately upon order creation.
            // Online orders are handled via reserveForOrder() after the full loop.
            // Offline sync defers prepared-stock handling; recipe inventory runs on sync.
            if (!$isOnlineOrder && !$offlineSync) {
                if ($variant && $variant->track_stock) {
                    $key = 'pos:order:' . $order->id . ':item:' . $orderItem->id;
                    app(StockManagementService::class)->deductVariantStock(
                        $lockedVariant ?? $variant,
                        $quantity,
                        $key,
                        $order->id,
                        $user?->id,
                    );
                } elseif ($itemModel->track_stock && $itemModel->availability_type === 'stock_based') {
                    $key = 'pos:order:' . $order->id . ':item:' . $orderItem->id;
                    app(StockManagementService::class)->deductPreparedStock(
                        $lockedItem,
                        $quantity,
                        $key,
                        $order->id,
                        $user?->id,
                    );
                }
            }

            if (!empty($itemPayload['modifiers'])) {
                foreach ($itemPayload['modifiers'] as $modifierPayload) {
                    $modifierId = $modifierPayload['modifier_id'];

                    // Use already-loaded collection — no extra DB query per modifier
                    $modifierModel = $itemModel->modifiers->firstWhere('id', $modifierId);
                    if (!$modifierModel) {
                        abort(422, "Modifier {$modifierId} not valid for item {$itemId}");
                    }
                    $modifierPrice = (float) $modifierModel->price;
                    $modifierQuantity = (int) ($modifierPayload['quantity'] ?? 1);
                    $modifierTotal += $modifierPrice * $modifierQuantity;

                    OrderItemModifier::create([
                        'order_item_id' => $orderItem->id,
                        'modifier_id' => $modifierModel->id,
                        'modifier_name' => $modifierModel->name,
                        'modifier_price' => $modifierPrice,
                        'quantity' => $modifierQuantity,
                    ]);
                }
            }

            $lineTotal = ($basePrice + $modifierTotal) * $quantity;

            if ($lineTotal < 0) {
                abort(422, "Negative line total calculated for item {$itemId}");
            }

            $subtotal += $lineTotal;
            $orderItem->update(['total_price' => $lineTotal]);
        }

        // Online orders: reserve prepared stock after all items are persisted.
        // This runs inside the same DB::transaction() so a failed reservation rolls
        // back the entire order creation — no orphaned order without reserved stock.
        if ($isOnlineOrder) {
            app(StockReservationService::class)->reserveForOrder($order);
        }

        return $subtotal;
    }

    private function generateOrderNumber(): string
    {
        $date = now()->toDateString();
        $dateFormatted = now()->format('Ymd');

        $sequence = DB::transaction(function () use ($date): int {
            $dailySeq = DB::table('daily_sequences')
                ->where('date', $date)
                ->lockForUpdate()
                ->first();

            if (!$dailySeq) {
                DB::table('daily_sequences')->insert([
                    'date' => $date,
                    'last_order_number' => 1,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                return 1;
            }

            $nextNumber = $dailySeq->last_order_number + 1;
            DB::table('daily_sequences')
                ->where('date', $date)
                ->update([
                    'last_order_number' => $nextNumber,
                    'updated_at' => now(),
                ]);

            return $nextNumber;
        });

        $sequenceStr = str_pad((string) $sequence, 4, '0', STR_PAD_LEFT);

        return "BG-{$dateFormatted}-{$sequenceStr}";
    }
}
