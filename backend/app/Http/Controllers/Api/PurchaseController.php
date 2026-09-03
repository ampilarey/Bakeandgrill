<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Finance\Services\NonStockPurchaseExpenseService;
use App\Domains\Gst\Services\GstInputTaxValidator;
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
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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

        return response()->json([
            'purchases' => $query->orderByDesc('purchase_date')->paginate(50),
        ]);
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

        return response()->json(['purchase' => $purchase]);
    }

    public function update(UpdatePurchaseRequest $request, $id)
    {
        $purchase = Purchase::findOrFail($id);
        $validated = $request->validated();
        $validator = app(GstInputTaxValidator::class);
        $validated = $validator->normalizePurchase(array_merge($purchase->toArray(), $validated));
        $validator->assertClaimable($validated, 'purchase');
        $purchase->update($validated);

        return response()->json(['purchase' => $purchase]);
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

    private function generatePurchaseNumber(): string
    {
        // Lock the latest record to prevent duplicate number generation under concurrency
        $date = now()->format('Ymd');
        $count = Purchase::whereDate('purchase_date', now()->toDateString())->lockForUpdate()->get(['id'])->count() + 1;
        $sequence = str_pad((string) $count, 4, '0', STR_PAD_LEFT);

        return "PO-{$date}-{$sequence}";
    }

    private function createFromPayload(array $validated, Request $request): Purchase
    {
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
                $lineTotal = (float) $itemPayload['quantity'] * (float) $itemPayload['unit_cost'];
                $subtotal += $lineTotal;

                $inventoryItem = null;
                if (!empty($itemPayload['inventory_item_id'])) {
                    $inventoryItem = InventoryItem::lockForUpdate()->find($itemPayload['inventory_item_id']);
                }

                $newQty = (float) $itemPayload['quantity'];
                $lineStockIn = $shouldStockIn && $inventoryItem !== null;
                // Non-stock lines on a received PO are marked complete (no inventory movement).
                $lineReceived = $lineStockIn || ($shouldStockIn && $inventoryItem === null);
                $purchaseItem = PurchaseItem::create([
                    'purchase_id' => $purchase->id,
                    'inventory_item_id' => $inventoryItem?->id,
                    'quantity' => $newQty,
                    'unit_cost' => $itemPayload['unit_cost'],
                    'total_cost' => $lineTotal,
                    'received_quantity' => $lineReceived ? $newQty : 0,
                    'receive_status' => $lineReceived ? 'complete' : 'pending',
                ]);

                if ($lineStockIn) {
                    $oldStock = max(0, (float) ($inventoryItem->current_stock ?? 0));
                    $oldCost = (float) ($inventoryItem->unit_cost ?? 0);
                    $newCost = (float) $itemPayload['unit_cost'];

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
                            'unit_cost' => $costRecorded ? $itemPayload['unit_cost'] : null,
                            'reference_type' => 'purchase',
                            'reference_id' => $purchase->id,
                            'notes' => $validated['notes'] ?? null,
                        ]);

                        // S7: inside the guard. A retried create used to leave a
                        // second identical price point behind and skew any
                        // average built on it, while the stock itself was safe.
                        if ($purchase->supplier_id && $costRecorded) {
                            SupplierPriceHistory::create([
                                'supplier_id' => $purchase->supplier_id,
                                'inventory_item_id' => $inventoryItem->id,
                                'purchase_id' => $purchase->id,
                                'unit_price' => $itemPayload['unit_cost'],
                                'unit' => $inventoryItem->unit,
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
