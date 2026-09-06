<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Finance\Services\NonStockPurchaseExpenseService;
use App\Domains\Gst\Services\GstInputTaxValidator;
use App\Domains\Inventory\Services\PurchaseEditPolicy;
use App\Http\Controllers\Controller;
use App\Http\Requests\ImportPurchaseRequest;
use App\Http\Requests\StorePurchaseReceiptRequest;
use App\Http\Requests\StorePurchaseRequest;
use App\Http\Requests\UpdatePurchaseRequest;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\PurchaseReceipt;
use App\Models\StockMovement;
use App\Models\SupplierPriceHistory;
use App\Services\AuditLogService;
use App\Services\PurchasePackResolver;
use App\Services\SupplierResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PurchaseController extends Controller
{
    public function index(Request $request)
    {
        $query = Purchase::with(['supplier', 'items']);

        if ($request->has('status')) {
            $query->where('status', $request->query('status'));
        }

        if ($request->filled('search')) {
            $raw = (string) $request->query('search');
            $term = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $raw) . '%';
            $query->where(function ($q) use ($term, $raw) {
                $q->where('purchase_number', 'like', $term)
                    ->orWhere('notes', 'like', $term)
                    ->orWhere('supplier_invoice_no', 'like', $term)
                    ->orWhereHas('supplier', fn ($sq) => $sq->where('name', 'like', $term));
                if (ctype_digit($raw)) {
                    $q->orWhere('id', (int) $raw);
                }
            });
        }

        $page = $query->orderByDesc('purchase_date')->paginate(50);

        /*
         * What may still be done to each order, decided server-side. The list
         * used to work it out from the status alone, which is not enough — an
         * "ordered" PO with one crate already in is not editable, and only the
         * lines know that. Sending the answer also means the screen can say
         * *why* a button is missing.
         */
        $policy = app(PurchaseEditPolicy::class);
        $page->through(fn (Purchase $purchase) => tap($purchase, function ($p) use ($policy) {
            foreach ($policy->summary($p) as $key => $value) {
                $p->setAttribute($key, $value);
            }
        }));

        return response()->json(['purchases' => $page]);
    }

    public function store(StorePurchaseRequest $request)
    {
        $validated = $request->validated();
        $validator = app(GstInputTaxValidator::class);
        $validated = $validator->normalizePurchase($validated);
        $validator->assertClaimable($validated, 'purchase');
        $purchase = $this->createFromPayload($validated, $request);

        app(AuditLogService::class)->log(
            'purchase.created',
            'Purchase',
            $purchase->id,
            [],
            $purchase->toArray(),
            ['items' => $purchase->items->count()],
            $request,
        );

        return response()->json(['purchase' => $purchase], 201);
    }

    public function show($id)
    {
        $purchase = Purchase::with(['supplier', 'items.inventoryItem'])
            ->findOrFail($id);

        foreach (app(PurchaseEditPolicy::class)->summary($purchase) as $key => $value) {
            $purchase->setAttribute($key, $value);
        }

        return response()->json(['purchase' => $purchase]);
    }

    public function update(UpdatePurchaseRequest $request, $id)
    {
        $purchase = Purchase::with('items')->findOrFail($id);
        $validated = $request->validated();
        $lines = $validated['items'] ?? null;
        unset($validated['items']);

        /*
         * Owner, 2026-09-06: "how to cancel/delete or edit the po". The lines
         * could not be touched at all — a wrong quantity or a wrong price meant
         * cancelling and raising the order again.
         *
         * Guarded, because a received line has already produced a stock
         * movement, a weighted-average cost change and a price-history row.
         * Rewriting it underneath those would leave the ledger describing an
         * order that never happened.
         */
        if ($lines !== null) {
            $blocked = app(PurchaseEditPolicy::class)->whyCannotEdit($purchase);
            if ($blocked !== null) {
                return response()->json(['message' => $blocked], 422);
            }
        }

        /*
         * Claimability is judged on what the purchase *will* look like — the
         * incoming fields over the stored ones — but only the incoming fields
         * are written. Merging the row back into `update()` would restate
         * every column with its own value, and hand the model its own `id` and
         * timestamps while it is at it.
         */
        $gstValidator = app(GstInputTaxValidator::class);
        $effective = $gstValidator->normalizePurchase(array_merge(
            $purchase->attributesToArray(),
            $validated,
        ));
        $gstValidator->assertClaimable($effective, 'purchase');

        $changes = array_intersect_key($effective, $validated + ['gst_rate_bp' => null]);
        $before = $purchase->only(['subtotal', 'total', 'status', 'purchase_date']);

        DB::transaction(function () use ($purchase, $changes, $lines) {
            $purchase->update($changes);

            if ($lines !== null) {
                $this->replaceLines($purchase, $lines);
            }
        });

        if ($lines !== null) {
            app(AuditLogService::class)->log(
                'purchase.lines_edited',
                'Purchase',
                $purchase->id,
                $before,
                $purchase->fresh()->only(['subtotal', 'total', 'status', 'purchase_date']),
                ['items' => count($lines)],
                $request,
            );
        }

        return response()->json(['purchase' => $purchase->fresh(['supplier', 'items.inventoryItem'])]);
    }

    /**
     * Swap an unreceived order's lines for the ones just sent.
     *
     * Deleted and rewritten rather than diffed: the caller sends the order it
     * wants, and matching rows up to spare a few writes would add a merge to
     * get wrong. Nothing downstream holds a purchase_item id for an order that
     * has received nothing — that is precisely what the policy above
     * guarantees — so the old ids are free to go.
     *
     * @param list<array<string, mixed>> $lines
     */
    private function replaceLines(Purchase $purchase, array $lines): void
    {
        $purchase->items()->delete();

        $subtotal = 0.0;
        foreach ($lines as $line) {
            $inventoryItem = InventoryItem::find($line['inventory_item_id']);

            // The same conversion the order was created through, so a line
            // edited into "2 cases" prices exactly as it would have on day one.
            $priced = app(PurchasePackResolver::class)->resolve(
                $inventoryItem,
                (float) $line['quantity'],
                (float) $line['unit_cost'],
                $line['purchase_unit_id'] ?? null,
            );

            $subtotal += $priced['total'];

            PurchaseItem::create([
                'purchase_id' => $purchase->id,
                'inventory_item_id' => $inventoryItem?->id,
                'quantity' => $priced['quantity'],
                'unit_cost' => $priced['unit_cost'],
                'total_cost' => $priced['total'],
                'pack_name' => $priced['pack_name'],
                'pack_size' => $priced['pack_size'],
                'pack_quantity' => $priced['pack_quantity'],
                'brand' => isset($line['brand']) && trim((string) $line['brand']) !== ''
                    ? trim((string) $line['brand'])
                    : null,
                // Nothing has arrived — the policy would not have let us here
                // otherwise — so every line starts over as pending.
                'received_quantity' => 0,
                'receive_status' => 'pending',
            ]);
        }

        $purchase->update([
            'subtotal' => round($subtotal, 2),
            'total' => round($subtotal + (float) ($purchase->tax_amount ?? 0), 2),
        ]);
    }

    /**
     * Take a purchase order off the list.
     *
     * Soft: the owner wants a mistake gone, an auditor wants to know a
     * document with that number existed and who removed it. Only a draft
     * nobody approved, or a cancelled order that never received a thing —
     * anything stock arrived against is part of the record.
     */
    public function destroy(Request $request, $id)
    {
        $purchase = Purchase::with('items')->findOrFail($id);

        $blocked = app(PurchaseEditPolicy::class)->whyCannotDelete($purchase);
        if ($blocked !== null) {
            return response()->json(['message' => $blocked], 422);
        }

        app(AuditLogService::class)->log(
            'purchase.deleted',
            'Purchase',
            $purchase->id,
            $purchase->only(['purchase_number', 'status', 'subtotal', 'total', 'purchase_date']),
            [],
            ['items' => $purchase->items->count()],
            $request,
        );

        $purchase->delete();

        return response()->json(['message' => 'Purchase order deleted.']);
    }

    /**
     * @deprecated Use PurchaseWorkflowController::receive (POST /purchases/{id}/receive).
     * Kept as a thin delegate so any lingering clients hit the same stock-in path.
     */
    public function receive(Request $request, $id)
    {
        return app(PurchaseWorkflowController::class)->receive($request, (int) $id);
    }

    public function uploadReceipt(StorePurchaseReceiptRequest $request, $id)
    {
        $purchase = Purchase::findOrFail($id);
        $file = $request->file('receipt');

        $path = $file->store('purchase-receipts');

        $receipt = PurchaseReceipt::create([
            'purchase_id' => $purchase->id,
            'user_id' => $request->user()?->id,
            'file_path' => $path,
            'file_name' => $file->getClientOriginalName(),
            'mime_type' => $file->getClientMimeType(),
        ]);

        app(AuditLogService::class)->log(
            'purchase.receipt_uploaded',
            'PurchaseReceipt',
            $receipt->id,
            [],
            $receipt->toArray(),
            ['purchase_id' => $purchase->id],
            $request,
        );

        return response()->json(['receipt' => $receipt], 201);
    }

    public function import(ImportPurchaseRequest $request)
    {
        $validated = $request->validated();
        $file = $request->file('file');
        $purchaseDate = $validated['purchase_date'] ?? now()->toDateString();
        $supplierId = $validated['supplier_id'] ?? null;
        $notes = $validated['notes'] ?? null;

        $rows = [];
        $handle = fopen($file->getRealPath(), 'r');
        if ($handle === false) {
            return response()->json(['message' => 'Unable to read file.'], 422);
        }

        $header = fgetcsv($handle);
        if (!$header) {
            return response()->json(['message' => 'CSV is empty.'], 422);
        }

        $normalized = array_map(fn ($value) => strtolower(trim($value)), $header);
        $required = ['name', 'quantity', 'unit_cost'];
        foreach ($required as $column) {
            if (!in_array($column, $normalized, true)) {
                return response()->json(['message' => "Missing required column: {$column}."], 422);
            }
        }

        while (($data = fgetcsv($handle)) !== false) {
            if (count($rows) >= 2000) {
                fclose($handle);

                return response()->json(['message' => 'CSV exceeds the maximum of 2,000 rows.'], 422);
            }

            $row = array_combine($normalized, $data);
            if (!$row || empty($row['name'])) {
                continue;
            }

            $rows[] = [
                'inventory_item_id' => !empty($row['inventory_item_id']) ? (int) $row['inventory_item_id'] : null,
                'name' => $row['name'],
                'quantity' => (float) $row['quantity'],
                'unit_cost' => (float) $row['unit_cost'],
            ];
        }
        fclose($handle);

        if (count($rows) === 0) {
            return response()->json(['message' => 'No valid rows found.'], 422);
        }

        $purchase = $this->createFromPayload([
            'supplier_id' => $supplierId,
            'purchase_date' => $purchaseDate,
            // CSV import with inventory links stocks immediately; unmatched lines skip stock-in.
            'status' => 'received',
            'notes' => $notes,
            'items' => $rows,
        ], $request);

        app(AuditLogService::class)->log(
            'purchase.imported',
            'Purchase',
            $purchase->id,
            [],
            $purchase->toArray(),
            ['rows' => count($rows)],
            $request,
        );

        return response()->json(['purchase' => $purchase], 201);
    }

    /**
     * The next PO number for today.
     *
     * The sequence counts what was *entered* today, not what is dated today.
     * Counting by `purchase_date` looked equivalent until the day someone
     * backdated a delivery: a purchase dated last week never advanced today's
     * counter, so the next purchase — backdated or not — was handed a number
     * that was already taken, and `purchase_number` is unique, so it died on
     * the insert instead of saving (2026-09-04).
     *
     * The trailing uniqueness loop covers the rest: a number claimed by an
     * older code path, or a row created between the count and the insert.
     */
    private function generatePurchaseNumber(): string
    {
        $date = now()->format('Ymd');

        // Lock the day's rows so two concurrent creates cannot read the same
        // count. `withTrashed` throughout: the unique index does not forget a
        // deleted order's number, so neither can the generator.
        $count = Purchase::withTrashed()
            ->whereDate('created_at', now()->toDateString())
            ->lockForUpdate()
            ->get(['id'])
            ->count();

        for ($attempt = 1; $attempt <= 50; $attempt++) {
            $sequence = str_pad((string) ($count + $attempt), 4, '0', STR_PAD_LEFT);
            $candidate = "PO-{$date}-{$sequence}";
            if (!Purchase::withTrashed()->where('purchase_number', $candidate)->exists()) {
                return $candidate;
            }
        }

        // Fifty taken in a row means something is badly out of step; a unique
        // suffix is better than throwing away the purchase being entered.
        return "PO-{$date}-" . strtoupper(Str::random(6));
    }

    private function createFromPayload(array $validated, Request $request): Purchase
    {
        // One seller. A typed shop name becomes a supplier record, so every
        // purchase has somebody to hang its prices on — the price-history write
        // further down is guarded on `supplier_id`, and a purchase without one
        // used to record no price at all.
        $seller = app(SupplierResolver::class)->resolve(
            isset($validated['supplier_id']) ? (int) $validated['supplier_id'] : null,
            $validated['supplier_name_text'] ?? null,
        );
        $validated['supplier_id'] = $seller?->id;
        $validated['supplier_name_text'] = $seller?->name;

        return DB::transaction(function () use ($validated, $request) {
            $gstFields = array_intersect_key($validated, array_flip([
                'supplier_tin', 'supplier_invoice_no', 'supplier_invoice_date',
                'amount_excluding_gst_laar', 'gst_rate_bp', 'gst_laar', 'total_laar',
                'is_tax_invoice_received', 'is_input_tax_claimable', 'claim_block_reason',
                'revenue_or_capital', 'taxable_activity_no',
            ]));

            // Default draft so admin POs don't stock until receive. POS quick-receive
            // passes status=received explicitly.
            $status = $validated['status'] ?? 'draft';
            $shouldStockIn = $status === 'received';

            $purchase = Purchase::create(array_merge([
                'purchase_number' => $this->generatePurchaseNumber(),
                'supplier_id' => $validated['supplier_id'] ?? null,
                'supplier_name_text' => $validated['supplier_name_text'] ?? null,
                'user_id' => $request->user()?->id,
                'status' => $status,
                'subtotal' => 0,
                'tax_amount' => 0,
                'total' => 0,
                'notes' => $validated['notes'] ?? null,
                'purchase_date' => $validated['purchase_date'],
            ], $gstFields));

            $subtotal = 0;

            foreach ($validated['items'] as $itemPayload) {
                $inventoryItem = null;
                if (!empty($itemPayload['inventory_item_id'])) {
                    $inventoryItem = InventoryItem::lockForUpdate()->find($itemPayload['inventory_item_id']);
                }

                /*
                 * A line may be priced by the pack — one case of eggs rather
                 * than 210 eggs. Everything below this point works in the
                 * item's own unit, so the conversion happens once, here.
                 * Without a pack the numbers pass straight through.
                 */
                $priced = app(PurchasePackResolver::class)->resolve(
                    $inventoryItem,
                    (float) $itemPayload['quantity'],
                    (float) $itemPayload['unit_cost'],
                    $itemPayload['purchase_unit_id'] ?? null,
                );

                $lineTotal = $priced['total'];
                $subtotal += $lineTotal;

                $newQty = $priced['quantity'];
                $lineStockIn = $shouldStockIn && $inventoryItem !== null;
                // Non-stock lines on a received PO are marked complete (no inventory movement).
                $lineReceived = $lineStockIn || ($shouldStockIn && $inventoryItem === null);
                $purchaseItem = PurchaseItem::create([
                    'purchase_id' => $purchase->id,
                    'inventory_item_id' => $inventoryItem?->id,
                    'quantity' => $newQty,
                    'unit_cost' => $priced['unit_cost'],
                    'total_cost' => $lineTotal,
                    // What was on the box, kept as typed so the order still
                    // reads "2 Case" a year after somebody edits the pack size.
                    'pack_name' => $priced['pack_name'],
                    'pack_size' => $priced['pack_size'],
                    'pack_quantity' => $priced['pack_quantity'],
                    'brand' => isset($itemPayload['brand']) && trim((string) $itemPayload['brand']) !== ''
                        ? trim((string) $itemPayload['brand'])
                        : null,
                    'received_quantity' => $lineReceived ? $newQty : 0,
                    'receive_status' => $lineReceived ? 'complete' : 'pending',
                ]);

                if ($lineStockIn) {
                    $oldStock = max(0, (float) ($inventoryItem->current_stock ?? 0));
                    $oldCost = (float) ($inventoryItem->unit_cost ?? 0);
                    // Per unit of stock, never the pack price: averaging the
                    // cost of a whole case into the cost of one egg would
                    // multiply this item's value by the size of the box.
                    $newCost = $priced['unit_cost'];

                    $idempotencyKey = 'purchase:' . $purchase->id . ':item:' . $purchaseItem->id;
                    if (!StockMovement::where('idempotency_key', $idempotencyKey)->exists()) {
                        $inventoryItem->current_stock = $oldStock + $newQty;

                        // S1, same rule as the purchase-request path: a line
                        // priced at nothing says nothing about what the item
                        // costs, so it must not average zero into unit_cost.
                        $costRecorded = $newCost > 0;
                        $totalStock = $oldStock + $newQty;
                        if ($costRecorded) {
                            $inventoryItem->last_purchase_price = $newCost;
                            if ($totalStock > 0) {
                                $inventoryItem->unit_cost = round(
                                    ($oldStock * $oldCost + $newQty * $newCost) / $totalStock,
                                    4,
                                );
                            }
                        }
                        $inventoryItem->save();

                        StockMovement::create([
                            'idempotency_key' => $idempotencyKey,
                            'inventory_item_id' => $inventoryItem->id,
                            'user_id' => $request->user()?->id,
                            'type' => 'purchase',
                            'quantity' => $newQty,
                            'balance_after' => $inventoryItem->current_stock,
                            'unit_cost' => $costRecorded ? $newCost : null,
                            'reference_type' => 'purchase',
                            'reference_id' => $purchase->id,
                            'notes' => $validated['notes'] ?? null,
                            // The day the goods actually arrived, so a delivery
                            // entered late still counts in the week it landed.
                            'occurred_at' => StockMovement::occurredAtFor($purchase->purchase_date),
                        ]);

                        // S7: inside the guard. A retried create used to leave a
                        // second identical price point behind and skew any
                        // average built on it, while the stock itself was safe.
                        if ($purchase->supplier_id && $costRecorded) {
                            SupplierPriceHistory::create([
                                'supplier_id' => $purchase->supplier_id,
                                'inventory_item_id' => $inventoryItem->id,
                                'purchase_id' => $purchase->id,
                                // Comparable with every other price for this
                                // item, so a case and a loose dozen rank against
                                // each other on what one egg actually cost.
                                'unit_price' => $newCost,
                                'unit' => $inventoryItem->unit,
                                // So a price comparison can separate brands
                                // rather than averaging them into one number.
                                'brand' => $purchaseItem->brand,
                                'recorded_at' => $purchase->purchase_date ?? now()->toDateString(),
                            ]);
                        }
                    }
                }
            }

            $gstLaar = (int) ($validated['gst_laar'] ?? 0);
            $totalLaar = (int) ($validated['total_laar'] ?? round($subtotal * 100));
            $purchase->update([
                'subtotal' => $subtotal,
                'tax_amount' => round($gstLaar / 100, 2),
                'total' => round($totalLaar / 100, 2),
                'total_laar' => $totalLaar > 0 ? $totalLaar : (int) round($subtotal * 100),
                'gst_laar' => $gstLaar,
            ]);

            $purchase = $purchase->load(['supplier', 'items.inventoryItem', 'receipts']);
            app(NonStockPurchaseExpenseService::class)->syncForPurchase($purchase, $request->user());

            return $purchase->fresh(['supplier', 'items.inventoryItem', 'receipts']);
        });
    }
}
