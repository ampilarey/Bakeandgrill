<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

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

        return response()->json([
            'purchases' => $query->orderByDesc('purchase_date')->paginate(50),
        ]);
    }

    public function store(StorePurchaseRequest $request)
    {
        $validated = $request->validated();
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
        $purchase->update($request->validated());

        return response()->json(['purchase' => $purchase]);
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
        $date = now()->format('Ymd');
        $count = Purchase::whereDate('purchase_date', now()->toDateString())->count() + 1;
        $sequence = str_pad((string) $count, 4, '0', STR_PAD_LEFT);

        return "PO-{$date}-{$sequence}";
    }

    private function createFromPayload(array $validated, Request $request): Purchase
    {
        return DB::transaction(function () use ($validated, $request) {
            $purchase = Purchase::create([
                'purchase_number' => $this->generatePurchaseNumber(),
                'supplier_id' => $validated['supplier_id'] ?? null,
                'user_id' => $request->user()?->id,
                'status' => $validated['status'] ?? 'received',
                'subtotal' => 0,
                'tax_amount' => 0,
                'total' => 0,
                'notes' => $validated['notes'] ?? null,
                'purchase_date' => $validated['purchase_date'],
            ]);

            $subtotal = 0;

            foreach ($validated['items'] as $itemPayload) {
                $lineTotal = (float) $itemPayload['quantity'] * (float) $itemPayload['unit_cost'];
                $subtotal += $lineTotal;

                $inventoryItem = null;
                if (!empty($itemPayload['inventory_item_id'])) {
                    $inventoryItem = InventoryItem::find($itemPayload['inventory_item_id']);
                }

                PurchaseItem::create([
                    'purchase_id' => $purchase->id,
                    'inventory_item_id' => $inventoryItem?->id,
                    'quantity' => $itemPayload['quantity'],
                    'unit_cost' => $itemPayload['unit_cost'],
                    'total_cost' => $lineTotal,
                ]);

                if ($inventoryItem) {
                    $inventoryItem->current_stock = ($inventoryItem->current_stock ?? 0) + $itemPayload['quantity'];
                    $inventoryItem->last_purchase_price = $itemPayload['unit_cost'];
                    if (!$inventoryItem->unit_cost) {
                        $inventoryItem->unit_cost = $itemPayload['unit_cost'];
                    }
                    $inventoryItem->save();

                    StockMovement::create([
                        'inventory_item_id' => $inventoryItem->id,
                        'user_id' => $request->user()?->id,
                        'type' => 'purchase',
                        'quantity' => $itemPayload['quantity'],
                        'balance_after' => $inventoryItem->current_stock,
                        'unit_cost' => $itemPayload['unit_cost'],
                        'reference_type' => 'purchase',
                        'reference_id' => $purchase->id,
                        'notes' => $validated['notes'] ?? null,
                    ]);
                }
            }

            $purchase->update([
                'subtotal' => $subtotal,
                'total' => $subtotal,
            ]);

            return $purchase->load(['supplier', 'items.inventoryItem', 'receipts']);
        });
    }
}
