<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Domains\Orders\DTOs\OrderCreatedData;
use App\Domains\Orders\Events\OrderCreated;
use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Models\CateringRequest;
use App\Models\CateringRequestLine;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderItemModifier;
use App\Models\RestaurantTable;
use App\Models\Shift;
use App\Services\PrintJobService;
use App\Services\StockManagementService;
use App\Services\StockReservationService;
use App\Support\DeferAfterResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrderCreationService
{
    public function __construct(
        private OrderTotalsCalculator $calculator,
        private KitchenMenuResolver $kitchenMenuResolver,
        private \App\Services\SpecialPricingService $specialPricing,
        private PackagingFeeCalculator $packagingFeeCalculator,
        private PromotionEvaluator $promotionEvaluator,
        private \App\Services\EffectivePriceService $effectivePricing,
        private ManualDiscountPolicy $manualDiscountPolicy,
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

        // Customer online orders (no staff user; online_pickup/delivery, or prepaid
        // dine_in placed from the order app) must start as payment_pending so the
        // KDS never shows them before payment is confirmed. Kitchen print is also
        // suppressed here — pickup/delivery print via DispatchKitchenPrintListener
        // on OrderPaid; prepaid dine_in stays unfired until staff fire it before
        // the customer's arrival time.
        $isCustomerOnlineOrder = $user === null
            && in_array($payload['type'] ?? '', ['online_pickup', 'delivery', 'dine_in'], true);

        if ($isCustomerOnlineOrder) {
            $this->assertOnlineOrderThrottleNotExceeded();
        }

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
            $tableId = !empty($payload['restaurant_table_id'])
                ? (int) $payload['restaurant_table_id']
                : null;
            if ($tableId !== null && RestaurantTable::findActiveOrder($tableId) !== null) {
                abort(422, 'Table already has an open order.');
            }

            $order = Order::create([
                'order_number' => $this->generateOrderNumber(),
                'type' => $payload['type'],
                'status' => $initialStatus,
                // `payment_status` is computed by OrderPaymentController::addPayments
                // whenever payments are applied. At create time everything
                // starts as unpaid (the migration default also handles
                // backfill); the only exception is a zero-total order
                // (fully discount-covered or comp) which we leave as
                // unpaid until addPayments runs — keeps one source of truth.
                'payment_status' => 'unpaid',
                'fired_at' => $firedAt,
                'restaurant_table_id' => $tableId,
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
                'idempotency_key' => $payload['idempotency_key'] ?? null,
                'offline_local_number' => $payload['offline_local_number'] ?? null,
                'subtotal' => 0,
                'tax_amount' => 0,
                'discount_amount' => 0,
                'total' => 0,
                'notes' => $payload['notes'] ?? null,
                'customer_notes' => $payload['customer_notes'] ?? null,
                'pickup_slot_at' => !empty($payload['pickup_slot_at']) ? $payload['pickup_slot_at'] : null,
                // Null = same-day (existing behaviour). Tomorrow collection stores the
                // server-resolved date from OrderFulfilDateService — never trust the client.
                'fulfil_date' => !empty($payload['fulfil_date']) ? $payload['fulfil_date'] : null,
            ]);

            $this->addOrderItems($order, $payload['items'] ?? [], $user, !empty($payload['offline_sync']));

            // Seed in-memory subtotal so auto-promo min_order / discount math works
            // before the first recalculateAndPersist.
            $order->load('items.item');
            $computedSubtotalLaar = (int) round(
                (float) $order->items->sum('total_price') * 100,
            );
            $order->subtotal_laar = $computedSubtotalLaar;
            $order->subtotal = $computedSubtotalLaar / 100;

            // Auto-apply promotions (no code) before any coded promo path.
            // Item-level auto-promos are already baked into line prices via
            // EffectivePriceService — skip them here to avoid double discount.
            $this->promotionEvaluator->applyAutomatic(
                $order,
                isset($payload['customer_id']) ? (int) $payload['customer_id'] : null,
                itemLevelAlreadyInLinePrices: true,
            );

            // Manual discount — centralized policy (caps / reason / approval gate).
            $discountAmount = (float) ($payload['discount_amount'] ?? 0);
            $subtotalLaar = $computedSubtotalLaar;
            $requestedLaar = max(0, (int) round($discountAmount * 100));
            $actor = $user instanceof \App\Models\User ? $user : null;

            $decision = $this->manualDiscountPolicy->authorizeAndClamp(
                $actor,
                $subtotalLaar,
                $requestedLaar,
                isset($payload['discount_reason']) ? (string) $payload['discount_reason'] : null,
                isset($payload['discount_reason_note']) ? (string) $payload['discount_reason_note'] : null,
                (int) $order->id,
                null,
                viaApprovalConfirm: false,
                request: request(),
            );

            $order->update([
                'manual_discount_laar' => $decision->discountLaar,
                'manual_discount_reason' => $decision->reason,
                'manual_discount_reason_note' => $decision->reasonNote,
                'manual_discount_approved_by' => $decision->approvedByUserId,
            ]);

            // Use OrderTotalsCalculator as the single source of truth for every
            // totals field (subtotal_laar, tax_laar, total_laar, total, etc.).
            $order = $this->calculator->recalculateAndPersist($order);

            // Enforce minimum order value (not applicable to dine-in)
            $minOrderMvr = (float) config('ordering.minimum_order_mvr', 0);
            if ($minOrderMvr > 0 && $order->total < $minOrderMvr && ($payload['type'] ?? '') !== 'dine_in') {
                abort(422, 'Minimum order amount is MVR ' . number_format($minOrderMvr, 2));
            }

            $order->load(['items.modifiers']);

            if ($tableId !== null) {
                RestaurantTable::claimForOrder($tableId, (int) $order->id);
            }

            DB::afterCommit(function () use ($order, $payload, $printKitchen): void {
                DeferAfterResponse::run(function () use ($order, $printKitchen): void {
                    OrderCreated::dispatch(OrderCreatedData::fromOrder($order->fresh(), $printKitchen));
                }, 'OrderCreated');

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

    /**
     * Internal priced-from-quote path for catering event approval.
     * Snapshot unit prices from catering_request_lines are authoritative —
     * never re-resolve catalog prices, skip stock/86/channel checks, no kitchen print.
     */
    public function createFromCateringQuote(CateringRequest $request): Order
    {
        $request->loadMissing('lines');
        if ($request->lines->isEmpty()) {
            throw ValidationException::withMessages(['lines' => ['Quote has no lines.']]);
        }

        $placeholder = $this->resolveCustomCateringPlaceholder();

        return DB::transaction(function () use ($request, $placeholder): Order {
            $order = Order::create([
                'order_number' => $this->generateOrderNumber(),
                'type' => 'catering',
                'status' => 'payment_pending',
                'payment_status' => 'unpaid',
                'fired_at' => null,
                'customer_id' => $request->customer_id,
                'user_id' => null,
                'device_id' => null,
                'shift_id' => null,
                'subtotal' => 0,
                'tax_amount' => 0,
                'discount_amount' => 0,
                'total' => 0,
                'notes' => 'Event ' . $request->reference,
                'customer_notes' => $request->dietary_notes,
                'ticket_name' => $request->reference,
            ]);

            foreach ($request->lines as $line) {
                $this->addQuotedCateringLine($order, $line, $placeholder);
            }

            $order = $this->calculator->recalculateAndPersist($order);
            $order->load(['items.modifiers']);

            DB::afterCommit(function () use ($order): void {
                DeferAfterResponse::run(function () use ($order): void {
                    OrderCreated::dispatch(OrderCreatedData::fromOrder($order->fresh(), false));
                }, 'OrderCreated');

                if ($order->customer_id) {
                    Customer::where('id', $order->customer_id)
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
    /**
     * @param object|null $user Staff actor — when present, POS phone-in
     *                          delivery skips the public delivery gate.
     * @param string|null $effectiveType Target fulfillment type for the
     *                                   re-add (channel assert + stock
     *                                   deduct). Stock restore always uses
     *                                   the order's prior type. When null,
     *                                   keeps the current order type.
     */
    public function replaceOrderItems(
        Order $order,
        array $items,
        bool $reprintKitchen = true,
        ?object $user = null,
        ?string $effectiveType = null,
    ): Order {
        $updated = DB::transaction(function () use ($order, $items, $user, $effectiveType): Order {
            // Restore POS-deducted stock BEFORE soft-deleting the old lines,
            // otherwise the subsequent addOrderItems re-deducts and we leak
            // inventory on every "Save changes" tap.
            //
            // Online orders only RESERVE: release holds for this order before
            // re-add so removed lines do not leave orphan reservations until TTL.
            // (HTTP blocks edits on payment_pending; this keeps the service safe.)
            //
            // Idempotency key derived from the OLD order_item id so a
            // repeated edit of the same line can't double-restore. The
            // re-add path uses keys based on the NEW order_item id, so
            // restore + re-deduct keys never collide.
            //
            // Always key restore/release off the PRIOR type — switching
            // delivery → dine_in must release reservations, not attempt a
            // POS restore that was never deducted.
            $previousType = (string) $order->type;
            $isPosOrder = !in_array($previousType, ['online_pickup', 'delivery'], true);
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
            } else {
                app(StockReservationService::class)->releaseForOrder((int) $order->id);
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

            // Channel assert + stock deduct must use the *target* type
            // (e.g. leaving delivery while the public gate is paused).
            // In-memory only — the controller persists type/meta after this.
            if ($effectiveType !== null && $effectiveType !== '') {
                $order->type = $effectiveType;
            }

            $this->addOrderItems($order, $items, $user);

            // addOrderItems writes new rows to the DB but leaves the
            // in-memory relation empty (we cleared it above). Force a
            // reload before totals — otherwise recalculate sees zero
            // lines and persists total = 0.
            $order->unsetRelation('items');

            return $this->calculator->recalculateAndPersist($order);
        });

        // Sync open invoices + kitchen reprint after commit so both see
        // the final persisted lines/totals (never a mid-transaction empty
        // items relation that could rewrite the bill to MVR 0).
        DB::afterCommit(function () use ($updated, $reprintKitchen): void {
            $fresh = $updated->fresh(['items.modifiers']);
            if ($fresh === null) {
                return;
            }

            try {
                app(\App\Http\Controllers\Api\InvoiceController::class)
                    ->syncOpenSaleInvoiceFromOrder($fresh);
            } catch (\Throwable $e) {
                logger()->warning('replaceOrderItems: invoice sync failed', [
                    'order_id' => $fresh->id,
                    'error' => $e->getMessage(),
                ]);
            }

            // Fresh type so delivery → dine_in/takeaway still reprints.
            if ($reprintKitchen && !in_array((string) $fresh->type, ['online_pickup', 'delivery'], true)) {
                try {
                    app(PrintJobService::class)
                        ->enqueueKitchen($fresh, 'replaceItems');
                } catch (\Throwable $e) {
                    logger()->warning('replaceOrderItems: kitchen reprint enqueue failed', [
                        'order_id' => $fresh->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        });

        return $updated;
    }

    private function addOrderItems(Order $order, array $items, ?object $user = null, bool $offlineSync = false): float
    {
        $subtotal = 0;

        // Prepaid dine_in (customer order, still payment_pending) follows the online
        // path: reserve stock now, convert to deduction on OrderPaid. Staff dine_in
        // (status pending) keeps the POS immediate-deduct path — including add-ons
        // rung at the table later.
        $isOnlineOrder = in_array($order->type, ['online_pickup', 'delivery'], true)
            || ($order->type === 'dine_in' && $order->status === 'payment_pending');
        // Tomorrow collection must not consume today's sellable stock (Stage D).
        $deferStockForTomorrow = $order->fulfil_date !== null;

        // Pre-load all referenced items in a single query to avoid N+1
        $itemIds = array_column($items, 'item_id');
        $itemQuery = Item::with(['variants', 'modifiers', 'packagingOptions'])
            ->where('is_active', true)
            ->whereIn('id', $itemIds);
        // Same-day still requires available-today; tomorrow may include 86'd items
        // the owner ticked for tomorrow (validated earlier via allow_pre_order).
        if (!$deferStockForTomorrow) {
            $itemQuery->where('is_available', true);
        }
        $itemMap = $itemQuery->get()->keyBy('id');

        $this->kitchenMenuResolver->assertLineItemsAllowedForOrderType(
            $itemMap->all(),
            $items,
            $order->type,
            $user !== null && $order->type === 'delivery',
        );

        foreach ($items as $itemPayload) {
            $itemId = $itemPayload['item_id'];
            $itemModel = $itemMap->get($itemId);

            if (!$itemModel) {
                abort(422, "Item {$itemId} not found or unavailable");
            }

            // Keep fractional qty (e.g. 0.5 kg). Casting to int turned
            // sub-1 quantities into 0 and zeroed the whole ticket.
            $quantity = (float) $itemPayload['quantity'];
            if ($quantity <= 0) {
                abort(422, "Quantity must be greater than zero for item {$itemId}.");
            }

            // ── Variant resolution ────────────────────────────────────────────
            $variantId = $itemPayload['variant_id'] ?? null;
            $variant = null;

            if ($itemModel->has_variants) {
                // Variant selection is mandatory for variant products
                if (!$variantId) {
                    abort(422, "Please select a size/option for \"{$itemModel->name}\".");
                }

                $variant = $itemModel->variants->firstWhere('id', $variantId);
                if (!$variant) {
                    abort(422, "Variant {$variantId} does not belong to item {$itemId}.");
                }
                if (!$variant->is_active) {
                    abort(422, "The selected option \"{$variant->name}\" for \"{$itemModel->name}\" is no longer available.");
                }
            } elseif ($variantId) {
                // Non-variant product: validate if a variant was still passed
                $variant = $itemModel->variants->firstWhere('id', $variantId);
                if (!$variant) {
                    abort(422, "Variant {$variantId} not found for item {$itemId}.");
                }
                if (!$variant->is_active) {
                    abort(422, "The selected option \"{$variant->name}\" for \"{$itemModel->name}\" is no longer available.");
                }
            }

            $catalogPrice = $variant ? (float) $variant->price : (float) $itemModel->base_price;

            // Always resolve price server-side — client unit_price is ignored (offline sync totals are validated separately).
            $pricing = $this->effectivePricing->resolveUnitPrice($itemModel->id, $catalogPrice, $itemModel, $variantId);
            $unitPrice = $pricing->unitPrice;
            $originalUnitPrice = $pricing->hasDiscount() ? $pricing->originalPrice : null;
            $dailySpecialId = $pricing->specialId;

            if ($dailySpecialId !== null && !$this->specialPricing->canAllocateSpecialQuantity($dailySpecialId, (int) ceil($quantity), $order->id)) {
                $unitPrice = $catalogPrice;
                $originalUnitPrice = null;
                $dailySpecialId = null;
            }

            $variantName = $variant?->name;

            // ── Stock check ───────────────────────────────────────────────────
            // Variant-level stock takes priority when the variant tracks its own stock.
            // Offline sync skips availability abort (Policy A) — deduct prepared stock below.
            // Tomorrow collection skips today's availability — stock is deducted on fire.
            if (!$offlineSync && !$deferStockForTomorrow) {
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

            $packagingOptionId = isset($itemPayload['packaging_option_id'])
                ? (int) $itemPayload['packaging_option_id']
                : null;
            if ($packagingOptionId !== null && $packagingOptionId <= 0) {
                $packagingOptionId = null;
            }
            $packaging = app(PackagingOptionResolver::class)->resolve($itemModel, $packagingOptionId);

            $orderItem = OrderItem::create([
                'order_id' => $order->id,
                'item_id' => $itemModel->id,
                'variant_id' => $variantId,
                'item_name' => $itemModel->name,
                'variant_name' => $variantName,
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'original_unit_price' => $originalUnitPrice,
                'daily_special_id' => $dailySpecialId,
                'total_price' => 0,
                'tax_rate' => (float) $itemModel->tax_rate,
                'tax_code' => $itemModel->tax_code ?? 'standard_8',
                'notes' => $notes,
                'packaging_option_id' => $packaging['packaging_option_id'],
                'packaging_fee' => $packaging['packaging_fee'],
                'packaging_fee_mode' => $packaging['packaging_fee_mode'],
                'packaging_option_name' => $packaging['packaging_option_name'],
                'status' => 'pending',
            ]);

            // POS only: deduct stock immediately upon order creation (including offline sync).
            // Online orders are handled via reserveForOrder() after the full loop.
            if (!$isOnlineOrder) {
                // Prepaid dine-in add-ons (customer order, staff rings extra lines
                // at the table) use the SAME key format convertToDeduction writes
                // ('online:order:{id}:item:{line}') so a later balance-settle
                // OrderPaid can never deduct these lines a second time — the
                // StockMovement idempotency key already exists.
                $keyPrefix = ($order->type === 'dine_in' && $order->user_id === null)
                    ? 'online:order:'
                    : 'pos:order:';
                // Prepared/variant stock columns are whole units; order qty is float for kg lines.
                $stockQty = max(0, (int) round($quantity));
                if ($stockQty > 0 && $variant && $variant->track_stock) {
                    $key = $keyPrefix . $order->id . ':item:' . $orderItem->id;
                    app(StockManagementService::class)->deductVariantStock(
                        $lockedVariant ?? $variant,
                        $stockQty,
                        $key,
                        $order->id,
                        $user?->id,
                    );
                } elseif ($stockQty > 0 && $itemModel->track_stock && $itemModel->availability_type === 'stock_based') {
                    $key = $keyPrefix . $order->id . ':item:' . $orderItem->id;
                    app(StockManagementService::class)->deductPreparedStock(
                        $lockedItem,
                        $stockQty,
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

            $lineTotal = ($unitPrice + $modifierTotal) * $quantity;

            if ($lineTotal < 0) {
                abort(422, "Negative line total calculated for item {$itemId}");
            }

            $subtotal += $lineTotal;
            $orderItem->update(['total_price' => $lineTotal]);
        }

        // Online orders: reserve prepared stock after all items are persisted.
        // This runs inside the same DB::transaction() so a failed reservation rolls
        // back the entire order creation — no orphaned order without reserved stock.
        // Tomorrow collection skips reservation so today's customers still see stock.
        if ($isOnlineOrder && !$deferStockForTomorrow) {
            app(StockReservationService::class)->reserveForOrder($order);
        }

        return $subtotal;
    }

    private function resolveCustomCateringPlaceholder(): Item
    {
        $item = Item::withTrashed()->where('sku', 'CATERING-CUSTOM')->first();
        if (!$item) {
            throw ValidationException::withMessages([
                'items' => ['Custom catering placeholder item is not configured.'],
            ]);
        }

        return $item;
    }

    private function addQuotedCateringLine(Order $order, CateringRequestLine $line, Item $placeholder): void
    {
        if ($line->unit_price === null) {
            throw ValidationException::withMessages([
                'lines' => ['All quote lines must be priced before approval.'],
            ]);
        }

        $unitPrice = round((float) $line->unit_price, 2);
        $qty = max(1, (int) $line->quantity);
        $catalogItem = null;
        $usePlaceholder = (bool) $line->is_custom || !$line->item_id;

        if (!$usePlaceholder) {
            // Soft-deleted items are treated as deleted → placeholder.
            $catalogItem = Item::query()->find($line->item_id);
            if (!$catalogItem) {
                $usePlaceholder = true;
            }
        }

        $itemModel = $usePlaceholder ? $placeholder : $catalogItem;
        $itemName = $usePlaceholder
            ? mb_substr((string) $line->name, 0, 160)
            : (string) ($catalogItem?->name ?: $line->name);
        $variantName = null;
        if (!$usePlaceholder && $line->variant_id && $catalogItem) {
            $variant = $catalogItem->variants()->where('id', $line->variant_id)->first();
            $variantName = $variant?->name;
            if ($variantName && !str_contains($itemName, $variantName)) {
                // Keep snapshot display name when it already includes variant.
                if (str_contains((string) $line->name, '—') || str_contains((string) $line->name, '-')) {
                    $itemName = mb_substr((string) $line->name, 0, 160);
                }
            }
        } elseif ($usePlaceholder) {
            // Prefer the full snapshot name for custom/deleted lines.
            $itemName = mb_substr((string) $line->name, 0, 160);
        }

        $notes = $line->notes ? mb_substr(trim((string) $line->notes), 0, 255) : null;
        if ($notes === '') {
            $notes = null;
        }

        $lineTotal = $unitPrice * $qty;

        $packaging = [
            'packaging_option_id' => null,
            'packaging_fee' => 0.0,
            'packaging_fee_mode' => PackagingOptionResolver::MODE_PER_UNIT,
            'packaging_option_name' => null,
        ];
        if (!$usePlaceholder && $catalogItem) {
            $packaging = app(PackagingOptionResolver::class)->resolve(
                $catalogItem,
                $line->packaging_option_id !== null ? (int) $line->packaging_option_id : null,
            );
        }

        OrderItem::create([
            'order_id' => $order->id,
            'item_id' => $itemModel->id,
            'variant_id' => $usePlaceholder ? null : $line->variant_id,
            'item_name' => $itemName,
            'variant_name' => $usePlaceholder ? null : $variantName,
            'quantity' => $qty,
            'unit_price' => $unitPrice,
            'original_unit_price' => null,
            'daily_special_id' => null,
            'total_price' => $lineTotal,
            'tax_rate' => (float) ($itemModel->tax_rate ?? 0),
            'tax_code' => $itemModel->tax_code ?? 'standard_8',
            'notes' => $notes,
            'packaging_option_id' => $packaging['packaging_option_id'],
            'packaging_fee' => $packaging['packaging_fee'],
            'packaging_fee_mode' => $packaging['packaging_fee_mode'],
            'packaging_option_name' => $packaging['packaging_option_name'],
            'status' => 'pending',
        ]);
    }

    private function assertOnlineOrderThrottleNotExceeded(): void
    {
        $max = $this->packagingFeeCalculator->orderingMaxPer15Min();
        if ($max <= 0) {
            return;
        }

        $recentCount = Order::query()
            ->whereIn('type', ['online_pickup', 'delivery'])
            ->where('created_at', '>=', now()->subMinutes(15))
            ->count();

        if ($recentCount >= $max) {
            abort(429, 'Too many online orders. Please try again in a few minutes.');
        }
    }

    private function generateOrderNumber(): string
    {
        // Venue calendar day — must match POS "Today" (Maldives), not UTC.
        $now = \App\Support\BusinessDay::now();
        $date = $now->toDateString();
        $dateFormatted = $now->format('Ymd');

        // FIX 14 — the previous "SELECT … FOR UPDATE, then INSERT if
        // missing" pattern had a window between the SELECT and the
        // INSERT where two concurrent requests could both see no row
        // and both attempt an INSERT — the second one duplicated the
        // date PK. `insertOrIgnore` seeds the row atomically, then a
        // second lockForUpdate SELECT is guaranteed to hit a row and
        // takes the exclusive lock for the increment step.
        $sequence = DB::transaction(function () use ($date): int {
            DB::table('daily_sequences')->insertOrIgnore([
                'date' => $date,
                'last_order_number' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $dailySeq = DB::table('daily_sequences')
                ->where('date', $date)
                ->lockForUpdate()
                ->first();

            $nextNumber = ((int) ($dailySeq->last_order_number ?? 0)) + 1;
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
