<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Finance\Services\NonStockPurchaseExpenseService;
use App\Domains\Gst\Services\GstLedgerPoster;
use App\Domains\Gst\Services\GstPeriodService;
use App\Domains\Inventory\Services\PurchaseEditPolicy;
use App\Domains\Inventory\Services\RestockIntelligenceService;
use App\Models\Expense;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\StockMovement;
use App\Models\SupplierPriceHistory;
use App\Models\TaxLedgerEntry;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PurchaseWorkflowController extends Controller
{
    public function __construct(
        private readonly AuditLogService $audit,
        private readonly RestockIntelligenceService $restock,
        private readonly NonStockPurchaseExpenseService $nonStockExpense,
    ) {}

    // ──────────────────────────────────────────────────────────
    // Approve a purchase order
    // ──────────────────────────────────────────────────────────

    public function approve(Request $request, int $id): JsonResponse
    {
        $purchase = Purchase::findOrFail($id);

        if ($purchase->status !== 'draft') {
            return response()->json(['message' => 'Only draft purchases can be approved.'], 422);
        }

        $purchase->update([
            'status' => 'ordered',
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
        ]);

        $this->audit->log('purchase.approved', 'Purchase', $id, ['status' => 'draft'], ['status' => 'ordered'], [], $request);

        return response()->json(['purchase' => $purchase->fresh(['supplier', 'items'])]);
    }

    /**
     * @deprecated Use cancel(). Kept so any client still calling /reject works.
     */
    public function reject(Request $request, int $id): JsonResponse
    {
        return $this->cancel($request, $id);
    }

    /**
     * Call off a purchase order.
     *
     * Owner, 2026-09-06: "how to cancel/delete or edit the po". This existed
     * as "Reject", which is approval-workflow wording for a manager turning
     * somebody down. The everyday reason is neither approval nor rejection —
     * the supplier cannot deliver, or the order was a mistake — so it is
     * called what it is.
     *
     * Allowed on a partly-received order too, which short-closes it: a
     * supplier who cannot bring the rest is the ordinary case, and cancelling
     * never touches what already came in.
     */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $purchase = Purchase::with('items')->findOrFail($id);

        $blocked = app(PurchaseEditPolicy::class)->whyCannotCancel($purchase);
        if ($blocked !== null) {
            return response()->json(['message' => $blocked], 422);
        }

        $validated = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);
        $was = $purchase->status;

        $purchase->update([
            'status' => 'cancelled',
            'notes' => ($purchase->notes ? $purchase->notes . "\n" : '')
                . 'Cancelled: ' . ($validated['reason'] ?? 'No reason given'),
        ]);

        /*
         * An invoice raised from this order used to outlive it in Accounts
         * Payable, still claiming the full amount was owed. Nothing received
         * means nothing owed, so the unpaid invoice goes with the order; a
         * short-close leaves a real part-debt, which only a human can settle,
         * so that case gets a warning instead.
         */
        $payables = app(\App\Domains\Finance\Services\PurchasePayableSync::class);
        $receivedSomething = $purchase->items->contains(
            fn ($i) => (float) ($i->received_quantity ?? 0) > 0,
        );
        $invoiceWarning = $receivedSomething
            ? $payables->warnIfInvoiceOutOfStep($purchase)
            : $payables->voidUnpaidInvoiceFor(
                $purchase,
                'purchase order ' . $purchase->purchase_number . ' was cancelled',
            );

        $this->audit->log(
            'purchase.cancelled',
            'Purchase',
            $id,
            ['status' => $was],
            ['status' => 'cancelled'],
            ['reason' => $validated['reason'] ?? null],
            $request,
        );

        return response()->json([
            'purchase' => $purchase->fresh(['supplier', 'items']),
            'warnings' => array_values(array_filter([$invoiceWarning])),
        ]);
    }

    /**
     * Undo a receipt: put the stock back and return the order to `ordered`.
     *
     * Owner, 2026-09-06: "how can admin del or edit PO?" Every order in the
     * business was `received`, so the edit/cancel/delete policy answered no to
     * all three and the admin had no move at all. The rule — a purchase that
     * moved stock must not be quietly rewritten — was right; leaving it with no
     * way out was not.
     *
     * This is the way out, and it is a reversal rather than an erasure. What
     * the receipt did, it undoes, each part visibly:
     *
     *   - the stock comes back off with its own movements, so the shelf and
     *     the movement history agree and the original receipt still shows;
     *   - the price points that receipt wrote are removed, because a price
     *     nobody paid should not steer the next comparison;
     *   - the input GST comes off, unless its period is already filed, in
     *     which case it stays and the caller is told so;
     *   - the lines go back to pending and the order to `ordered`, where
     *     editing, cancelling and deleting already work.
     *
     * Anything it could not put right is returned in `warnings` rather than
     * being swallowed — an item that has since been used will go negative, and
     * the honest answer is to say so and ask for a stock count.
     */
    public function undoReceipt(Request $request, int $id): JsonResponse
    {
        $purchase = Purchase::with('items.inventoryItem')->findOrFail($id);

        $blocked = app(PurchaseEditPolicy::class)->whyCannotUndoReceipt($purchase);
        if ($blocked !== null) {
            return response()->json(['message' => $blocked], 422);
        }

        $validated = $request->validate(['reason' => ['required', 'string', 'max:500']]);
        $was = $purchase->status;
        $warnings = [];

        DB::transaction(function () use ($purchase, $request, $validated, &$warnings) {
            foreach ($purchase->items()->lockForUpdate()->get() as $pItem) {
                $received = (float) ($pItem->received_quantity ?? 0);

                if ($received > 0 && $pItem->inventory_item_id) {
                    $invItem = InventoryItem::lockForUpdate()->find($pItem->inventory_item_id);

                    if ($invItem !== null) {
                        // Keyed on what is being taken back, so a double-click
                        // or a retried request cannot remove the stock twice.
                        $key = 'purchase:' . $purchase->id . ':item:' . $pItem->id
                            . ':undo:' . round($received, 4);

                        if (!StockMovement::where('idempotency_key', $key)->exists()) {
                            $before = (float) ($invItem->current_stock ?? 0);
                            $after = $before - $received;

                            if ($after < 0) {
                                /*
                                 * Some of it has already been cooked or sold.
                                 * Taking it back off is still the truthful move
                                 * — this order no longer claims to have
                                 * delivered it — but the count is now wrong in
                                 * a way only a physical count can settle.
                                 */
                                $warnings[] = sprintf(
                                    '%s goes to %s %s: some of this delivery has already been used. Do a stock count.',
                                    $invItem->name,
                                    rtrim(rtrim(number_format($after, 3, '.', ''), '0'), '.'),
                                    $invItem->unit,
                                );
                            }

                            $invItem->current_stock = $after;
                            $invItem->save();

                            StockMovement::create([
                                'idempotency_key' => $key,
                                'inventory_item_id' => $invItem->id,
                                'user_id' => $request->user()?->id,
                                // An adjustment, not a negative purchase: this
                                // is a correction somebody made, and it should
                                // read as one in the movement history.
                                'type' => 'adjustment',
                                'quantity' => -$received,
                                'balance_after' => $after,
                                'unit_cost' => (float) $pItem->unit_cost,
                                'reference_type' => 'purchase',
                                'reference_id' => $purchase->id,
                                'notes' => 'Receipt undone on ' . $purchase->purchase_number
                                    . ': ' . $validated['reason'],
                                'occurred_at' => StockMovement::occurredAtFor(now()),
                            ]);
                        }
                    }
                }

                $pItem->received_quantity = 0;
                $pItem->receive_status = 'pending';
                $pItem->save();
            }

            /*
             * The prices this receipt recorded. They are what the buying
             * screen compares brands and shops on, and a price for a delivery
             * that did not happen would quietly steer the next order.
             */
            SupplierPriceHistory::where('purchase_id', $purchase->id)->delete();

            /*
             * A live order goes back to `ordered`, ready to receive again. A
             * short-closed one was cancelled on purpose — undoing its receipt
             * must not quietly resurrect it, so cancelled stays cancelled;
             * and with nothing received any more, it can now be deleted.
             */
            $purchase->status = $purchase->status === 'cancelled' ? 'cancelled' : 'ordered';
            $purchase->actual_delivery_date = null;
            $purchase->notes = ($purchase->notes ? $purchase->notes . "\n" : '')
                . 'Receipt undone: ' . $validated['reason'];
            $purchase->save();
        });

        /*
         * Input tax was claimed on receipt, so it comes off with the receipt —
         * unless the period is filed, when removing it would falsify a return
         * already sent to MIRA. Then it stays, and the caller hears about it.
         */
        $entry = TaxLedgerEntry::where('source_type', 'purchase')
            ->where('source_id', $purchase->id)
            ->first();

        if ($entry !== null) {
            if (app(GstPeriodService::class)->isLocked((string) $entry->period_key)) {
                $warnings[] = 'The GST for ' . $entry->period_key
                    . ' is already filed, so the input tax on this order was left in place.'
                    . ' Adjust it in the next return.';
            } else {
                $entry->delete();
            }
        }

        // The order's worth just changed; an invoice raised from it did not.
        $invoiceNote = app(\App\Domains\Finance\Services\PurchasePayableSync::class)
            ->warnIfInvoiceOutOfStep($purchase);
        if ($invoiceNote !== null) {
            $warnings[] = $invoiceNote;
        }

        // The auto-expense deliberately never deletes itself; say so rather
        // than leaving money on the books with nothing to explain it.
        if (Expense::where('purchase_id', $purchase->id)->exists()) {
            $warnings[] = 'An expense was raised from this order. It is not removed automatically —'
                . ' check the Expenses page.';
        }

        $this->audit->log(
            'purchase.receipt_undone',
            'Purchase',
            $id,
            ['status' => $was],
            ['status' => $purchase->status],
            ['reason' => $validated['reason'], 'warnings' => $warnings],
            $request,
        );

        return response()->json([
            'purchase' => $purchase->fresh(['supplier', 'items']),
            'warnings' => $warnings,
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Partial or full receiving
    // ──────────────────────────────────────────────────────────

    public function receive(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'actual_delivery_date' => ['nullable', 'date'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.purchase_item_id' => ['required', 'integer'],
            'items.*.received_quantity' => ['required', 'numeric', 'min:0'],
            'items.*.rejected' => ['nullable', 'boolean'],
        ]);

        $purchase = Purchase::with('items.inventoryItem')->findOrFail($id);

        if (!in_array($purchase->status, ['ordered', 'partial'])) {
            return response()->json(['message' => 'Only ordered or partial purchases can receive items.'], 422);
        }

        DB::transaction(function () use ($purchase, $validated, $request) {
            foreach ($validated['items'] as $line) {
                $pItem = PurchaseItem::where('id', $line['purchase_item_id'])
                    ->where('purchase_id', $purchase->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                $incomingQty = (float) $line['received_quantity'];
                $isRejected = (bool) ($line['rejected'] ?? false);

                if ($isRejected) {
                    $pItem->receive_status = 'rejected';
                    $pItem->save();

                    continue;
                }

                // Already fully received (e.g. stocked via purchase-request verify) — skip.
                if (
                    in_array((string) $pItem->receive_status, ['complete', 'rejected'], true)
                    && (float) ($pItem->received_quantity ?? 0) >= (float) $pItem->quantity
                ) {
                    continue;
                }

                $pItem->received_quantity = ($pItem->received_quantity ?? 0) + $incomingQty;

                if ($pItem->received_quantity >= $pItem->quantity) {
                    $pItem->receive_status = 'complete';
                } else {
                    $pItem->receive_status = 'partial';
                }
                $pItem->save();

                if ($pItem->inventory_item_id && $incomingQty > 0) {
                    $invItem = InventoryItem::lockForUpdate()->find($pItem->inventory_item_id);
                    if (!$invItem) {
                        continue;
                    }

                    $idempotencyKey = 'purchase:' . $purchase->id . ':item:' . $pItem->id . ':to:' . round((float) $pItem->received_quantity, 4);
                    if (StockMovement::where('idempotency_key', $idempotencyKey)->exists()) {
                        continue;
                    }

                    $oldStock = max(0, (float) ($invItem->current_stock ?? 0));
                    $oldCost = (float) ($invItem->unit_cost ?? 0);
                    $newCost = (float) $pItem->unit_cost;

                    $invItem->current_stock = $oldStock + $incomingQty;

                    if ($invItem->current_stock > 0) {
                        $invItem->unit_cost = round(
                            ($oldStock * $oldCost + $incomingQty * $newCost) / $invItem->current_stock,
                            4,
                        );
                    }
                    $invItem->last_purchase_price = $newCost;
                    $invItem->save();

                    StockMovement::create([
                        'idempotency_key' => $idempotencyKey,
                        'inventory_item_id' => $invItem->id,
                        'user_id' => $request->user()?->id,
                        'type' => 'purchase',
                        'quantity' => $incomingQty,
                        'balance_after' => $invItem->current_stock,
                        'unit_cost' => $newCost,
                        'reference_type' => 'purchase',
                        'reference_id' => $purchase->id,
                        'notes' => 'Partial receiving',
                        // The delivery date, matching what the price point is
                        // stamped with just below.
                        'occurred_at' => StockMovement::occurredAtFor(
                            $validated['actual_delivery_date']
                                ?? $purchase->actual_delivery_date
                                ?? $purchase->purchase_date,
                        ),
                    ]);

                    if ($purchase->supplier_id) {
                        SupplierPriceHistory::create([
                            'supplier_id' => $purchase->supplier_id,
                            'inventory_item_id' => $invItem->id,
                            'purchase_id' => $purchase->id,
                            'unit_price' => $newCost,
                            'unit' => $invItem->unit,
                            /*
                             * The brand was on the line and got dropped here,
                             * so anything received through the workflow — most
                             * of the purchase orders — was invisible to a
                             * brand comparison. PurchaseController's own write
                             * has always carried it; this one had not.
                             */
                            'brand' => $pItem->brand,
                            'recorded_at' => $validated['actual_delivery_date']
                                ?? $purchase->actual_delivery_date
                                ?? $purchase->purchase_date
                                ?? now()->toDateString(),
                        ]);
                    }
                }
            }

            // Update overall purchase status
            $purchase->refresh();
            $allItems = $purchase->items;
            $allComplete = $allItems->every(fn ($i) => in_array($i->receive_status, ['complete', 'rejected']));
            $anyReceived = $allItems->some(fn ($i) => in_array($i->receive_status, ['partial', 'complete']));

            if ($allComplete) {
                $purchase->status = 'received';
            } elseif ($anyReceived) {
                $purchase->status = 'partial';
            }

            if ($validated['actual_delivery_date'] ?? null) {
                $purchase->actual_delivery_date = $validated['actual_delivery_date'];
            }

            $purchase->save();
        });

        $purchase = $purchase->fresh(['items.inventoryItem', 'supplier']);
        $autoExpense = $this->nonStockExpense->syncForPurchase($purchase, $request->user());

        app(GstLedgerPoster::class)->postPurchaseInput($purchase, $request->user()?->id);

        return response()->json([
            'purchase' => $purchase,
            'auto_expense' => $autoExpense,
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Auto-suggest purchase order based on low stock
    // ──────────────────────────────────────────────────────────

    public function autoSuggest(Request $request): JsonResponse
    {
        $supplierFilter = $request->query('supplier_id');
        $coverDays = min(max((int) $request->query('cover_days', 14), 1), 90);
        $lookbackDays = min(max((int) $request->query('lookback_days', 30), 7), 180);

        // Items below reorder point (or min stock threshold)
        $lowItems = InventoryItem::where('is_active', true)
            ->whereNotNull('reorder_point')
            ->whereColumn('current_stock', '<=', 'reorder_point')
            ->with(['preferredSupplier', 'category'])
            ->get();

        if ($lowItems->isEmpty()) {
            return response()->json(['message' => 'No items are below reorder point.', 'items' => []]);
        }

        $usageByItem = DB::table('stock_movements')
            /*
             * Consumption is `sale` (recipes) plus `waste`; nothing has ever
             * written `deduction`, which is all this read — usage always came
             * back zero. `deduction` stays for any legacy rows.
             */
            ->whereIn('type', ['sale', 'waste', 'deduction'])
            ->where('created_at', '>=', now()->subDays($lookbackDays))
            ->where('quantity', '<', 0)
            ->whereIn('inventory_item_id', $lowItems->pluck('id'))
            ->selectRaw('inventory_item_id, SUM(ABS(quantity)) as consumed')
            ->groupBy('inventory_item_id')
            ->pluck('consumed', 'inventory_item_id');

        // Group by suggested supplier using preferred supplier, else cheapest price history
        $suggested = $lowItems->map(function ($item) use ($usageByItem, $lookbackDays, $coverDays) {
            $stock = (float) ($item->current_stock ?? 0);
            $rop = (float) ($item->reorder_point ?? 0);
            $reorderQty = (float) ($item->reorder_quantity ?? 0);
            $consumed = (float) ($usageByItem[$item->id] ?? 0);
            $dailyRate = $lookbackDays > 0 ? $consumed / $lookbackDays : 0.0;
            $effectiveCover = $item->cover_days !== null
                ? min(max((int) $item->cover_days, 1), 90)
                : $coverDays;
            $qtyInfo = $this->restock->suggestedOrderQuantity($stock, $rop, $reorderQty, $dailyRate, $effectiveCover);

            $suggestedSupplier = null;
            if ($item->preferred_supplier_id && $item->preferredSupplier) {
                $prefPrice = SupplierPriceHistory::where('inventory_item_id', $item->id)
                    ->where('supplier_id', $item->preferred_supplier_id)
                    ->orderByDesc('recorded_at')
                    ->value('unit_price');
                $suggestedSupplier = [
                    'id' => (int) $item->preferred_supplier_id,
                    'name' => $item->preferredSupplier->name,
                    'price' => $prefPrice !== null ? (float) $prefPrice : (float) ($item->last_purchase_price ?? 0),
                    'source' => 'preferred',
                ];
            } else {
                $cheapest = SupplierPriceHistory::where('inventory_item_id', $item->id)
                    ->with('supplier:id,name,is_active')
                    ->selectRaw('supplier_id, MIN(unit_price) as min_price, MAX(recorded_at) as latest')
                    ->groupBy('supplier_id')
                    ->orderBy('min_price')
                    ->first();
                if ($cheapest?->supplier) {
                    $suggestedSupplier = [
                        'id' => $cheapest->supplier_id,
                        'name' => $cheapest->supplier->name,
                        'price' => (float) $cheapest->min_price,
                        'source' => 'cheapest',
                    ];
                }
            }

            return [
                'inventory_item_id' => $item->id,
                'name' => $item->name,
                'unit' => $item->unit,
                'current_stock' => $stock,
                'reorder_point' => $rop,
                'suggested_quantity' => $qtyInfo['qty'],
                'suggestion_reason' => $qtyInfo['reason'],
                'daily_usage_rate' => round($dailyRate, 4),
                'last_unit_cost' => $item->last_purchase_price ? (float) $item->last_purchase_price : null,
                'suggested_supplier' => $suggestedSupplier,
            ];
        });

        if ($supplierFilter) {
            $suggested = $suggested->filter(fn ($s) => ($s['suggested_supplier'] ?? null) !== null && ($s['suggested_supplier']['id'] ?? null) == $supplierFilter)->values();
        }

        // Group by supplier for easy PO creation
        $bySup = $suggested->groupBy(fn ($s) => ($s['suggested_supplier'] ?? null)['id'] ?? 'unknown');

        return response()->json([
            'items' => $suggested,
            'by_supplier' => $bySup->map(fn ($items, $supId) => [
                'supplier_id' => $supId !== 'unknown' ? (int) $supId : null,
                'supplier_name' => ($items->first()['suggested_supplier'] ?? null)['name'] ?? 'Unknown',
                'items' => $items->values(),
                'estimated_total' => round($items->sum(fn ($i) => $i['suggested_quantity'] * ($i['last_unit_cost'] ?? 0)), 2),
            ])->values(),
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Create PO from auto-suggest for a specific supplier
    // ──────────────────────────────────────────────────────────

    public function createFromSuggest(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'expected_delivery_date' => ['nullable', 'date'],
            'default_lead_days' => ['nullable', 'integer', 'min:0', 'max:30'],
            'notes' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.inventory_item_id' => ['required', 'integer', 'exists:inventory_items,id'],
            'items.*.quantity' => ['required', 'numeric', 'min:0.001'],
            'items.*.unit_cost' => ['required', 'numeric', 'min:0'],
            'resolve_reorder_alerts' => ['sometimes', 'boolean'],
        ]);

        $itemIds = array_map(
            static fn (array $line): int => (int) $line['inventory_item_id'],
            $validated['items'],
        );
        $expectedDelivery = $validated['expected_delivery_date']
            ?? $this->expectedDeliveryFromLeadDays(
                $itemIds,
                (int) ($validated['default_lead_days'] ?? 3),
            );

        $purchase = DB::transaction(function () use ($validated, $request, $expectedDelivery) {
            $subtotal = 0.0;

            $po = Purchase::create([
                'purchase_number' => $this->generatePO(),
                'supplier_id' => $validated['supplier_id'],
                'user_id' => $request->user()->id,
                'status' => 'draft',
                'subtotal' => 0,
                'total' => 0,
                'purchase_date' => now()->toDateString(),
                'expected_delivery_date' => $expectedDelivery,
                'notes' => $validated['notes'] ?? 'Auto-generated from low-stock suggestion',
            ]);

            foreach ($validated['items'] as $line) {
                $lineTotal = round((float) $line['quantity'] * (float) $line['unit_cost'], 2);
                $subtotal += $lineTotal;

                PurchaseItem::create([
                    'purchase_id' => $po->id,
                    'inventory_item_id' => $line['inventory_item_id'],
                    'quantity' => $line['quantity'],
                    'unit_cost' => $line['unit_cost'],
                    'total_cost' => $lineTotal,
                ]);
            }

            $po->update(['subtotal' => $subtotal, 'total' => $subtotal]);

            return $po;
        });

        $resolvedAlerts = 0;
        if ($request->boolean('resolve_reorder_alerts')) {
            $resolvedAlerts = $this->restock->resolveOpenAlertsForItems($itemIds);
        }

        return response()->json([
            'purchase' => $purchase->load(['items.inventoryItem', 'supplier']),
            'resolved_alerts' => $resolvedAlerts,
        ], 201);
    }

    /**
     * PO-level ETA = today + max lead among lines (per-item lead_days, else default).
     *
     * @param list<int> $itemIds
     */
    private function expectedDeliveryFromLeadDays(array $itemIds, int $defaultLeadDays = 3): string
    {
        $defaultLeadDays = min(max($defaultLeadDays, 0), 30);
        $leads = InventoryItem::query()
            ->whereIn('id', $itemIds)
            ->pluck('lead_days', 'id');

        $maxLead = null;
        foreach ($itemIds as $id) {
            $raw = $leads[$id] ?? null;
            $lead = $raw !== null
                ? min(max((int) $raw, 0), 30)
                : $defaultLeadDays;
            $maxLead = $maxLead === null ? $lead : max($maxLead, $lead);
        }
        $maxLead ??= $defaultLeadDays;

        return now()->startOfDay()->addDays($maxLead)->toDateString();
    }

    private function generatePO(): string
    {
        $date = now()->format('Ymd');
        // withTrashed: `purchase_number` is unique in the database, and a
        // deleted order still holds its number there.
        $count = Purchase::withTrashed()->whereDate('purchase_date', now()->toDateString())->count();

        for ($attempt = 1; $attempt <= 50; $attempt++) {
            $candidate = 'PO-' . $date . '-' . str_pad((string) ($count + $attempt), 4, '0', STR_PAD_LEFT);
            if (!Purchase::withTrashed()->where('purchase_number', $candidate)->exists()) {
                return $candidate;
            }
        }

        return 'PO-' . $date . '-' . strtoupper(Str::random(6));
    }
}
