<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Finance\Services\NonStockPurchaseExpenseService;
use App\Domains\Gst\Services\GstLedgerPoster;
use App\Domains\Inventory\Services\RestockIntelligenceService;
use App\Models\InventoryItem;
use App\Models\Purchase;
use App\Models\PurchaseItem;
use App\Models\StockMovement;
use App\Models\SupplierPriceHistory;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

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

    public function reject(Request $request, int $id): JsonResponse
    {
        $purchase = Purchase::findOrFail($id);

        if (!in_array($purchase->status, ['draft', 'ordered'])) {
            return response()->json(['message' => 'Only draft or ordered purchases can be rejected.'], 422);
        }

        $validated = $request->validate(['reason' => ['nullable', 'string', 'max:500']]);

        $purchase->update([
            'status' => 'cancelled',
            'notes' => ($purchase->notes ? $purchase->notes . "\n" : '') . 'Rejected: ' . ($validated['reason'] ?? 'No reason given'),
        ]);

        $this->audit->log('purchase.rejected', 'Purchase', $id, [], [], [], $request);

        return response()->json(['purchase' => $purchase->fresh()]);
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
                    if (! $invItem) {
                        continue;
                    }

                    $idempotencyKey = 'purchase:'.$purchase->id.':item:'.$pItem->id.':to:'.round((float) $pItem->received_quantity, 4);
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
                    ]);

                    if ($purchase->supplier_id) {
                        SupplierPriceHistory::create([
                            'supplier_id' => $purchase->supplier_id,
                            'inventory_item_id' => $invItem->id,
                            'purchase_id' => $purchase->id,
                            'unit_price' => $newCost,
                            'unit' => $invItem->unit,
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
            ->where('type', 'deduction')
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
            $qtyInfo = $this->restock->suggestedOrderQuantity($stock, $rop, $reorderQty, $dailyRate, $coverDays);

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
            'items' => ['required', 'array', 'min:1'],
            'items.*.inventory_item_id' => ['required', 'integer', 'exists:inventory_items,id'],
            'items.*.quantity' => ['required', 'numeric', 'min:0.001'],
            'items.*.unit_cost' => ['required', 'numeric', 'min:0'],
        ]);

        $purchase = DB::transaction(function () use ($validated, $request) {
            $subtotal = 0.0;

            $po = Purchase::create([
                'purchase_number' => $this->generatePO(),
                'supplier_id' => $validated['supplier_id'],
                'user_id' => $request->user()->id,
                'status' => 'draft',
                'subtotal' => 0,
                'total' => 0,
                'purchase_date' => now()->toDateString(),
                'expected_delivery_date' => $validated['expected_delivery_date'] ?? null,
                'notes' => 'Auto-generated from low-stock suggestion',
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

        return response()->json(['purchase' => $purchase->load(['items.inventoryItem', 'supplier'])], 201);
    }

    private function generatePO(): string
    {
        $date = now()->format('Ymd');
        $count = Purchase::whereDate('purchase_date', now()->toDateString())->count() + 1;

        return 'PO-' . $date . '-' . str_pad((string) $count, 4, '0', STR_PAD_LEFT);
    }
}
