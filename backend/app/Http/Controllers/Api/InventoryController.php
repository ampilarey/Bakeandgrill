<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AdjustInventoryRequest;
use App\Http\Requests\StockCountRequest;
use App\Http\Requests\StoreInventoryItemRequest;
use App\Http\Requests\UpdateInventoryItemRequest;
use App\Models\InventoryItem;
use App\Models\PurchaseItem;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InventoryController extends Controller
{
    public function index(Request $request)
    {
        // SECURITY: Staff only
        if (!$request->user()->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }

        $query = InventoryItem::query();

        if ($request->has('active_only')) {
            $query->where('is_active', true);
        }

        if ($request->has('search')) {
            $search = $request->query('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('sku', 'like', "%{$search}%");
            });
        }

        return response()->json([
            'items' => $query->orderBy('name')->paginate(50),
        ]);
    }

    public function store(StoreInventoryItemRequest $request)
    {
        $item = InventoryItem::create($request->validated());

        return response()->json(['item' => $item], 201);
    }

    public function show($id)
    {
        $item = InventoryItem::with('stockMovements')->findOrFail($id);

        return response()->json(['item' => $item]);
    }

    public function update(UpdateInventoryItemRequest $request, $id)
    {
        $item = InventoryItem::findOrFail($id);
        $item->update($request->validated());

        return response()->json(['item' => $item]);
    }

    public function adjust(AdjustInventoryRequest $request, $id)
    {
        $item = InventoryItem::findOrFail($id);
        $validated = $request->validated();
        $quantity = (float) $validated['quantity'];
        $oldStock = $item->current_stock ?? 0;

        $item->current_stock = ($item->current_stock ?? 0) + $quantity;
        $item->save();

        $movement = StockMovement::create([
            'inventory_item_id' => $item->id,
            'user_id' => $request->user()?->id,
            'type' => $validated['type'],
            'quantity' => $quantity,
            'balance_after' => $item->current_stock,
            'unit_cost' => $validated['unit_cost'] ?? null,
            'reference_type' => 'manual',
            'reference_id' => null,
            'notes' => $validated['notes'] ?? null,
        ]);

        app(AuditLogService::class)->log(
            'inventory.adjusted',
            'InventoryItem',
            $item->id,
            ['current_stock' => $oldStock],
            ['current_stock' => $item->current_stock],
            ['movement_id' => $movement->id, 'type' => $validated['type']],
            $request,
        );

        return response()->json([
            'item' => $item,
            'movement' => $movement,
        ]);
    }

    public function stockCount(StockCountRequest $request)
    {
        $validated = $request->validated();
        $adjustments = [];

        DB::transaction(function () use ($validated, $request, &$adjustments) {
            foreach ($validated['counts'] as $count) {
                $item = InventoryItem::findOrFail($count['inventory_item_id']);
                $newQuantity = (float) $count['quantity'];
                $oldQuantity = (float) ($item->current_stock ?? 0);
                $difference = $newQuantity - $oldQuantity;

                $item->current_stock = $newQuantity;
                $item->save();

                $movement = StockMovement::create([
                    'inventory_item_id' => $item->id,
                    'user_id' => $request->user()?->id,
                    'type' => 'adjustment',
                    'quantity' => $difference,
                    'balance_after' => $item->current_stock,
                    'unit_cost' => $item->unit_cost ?? 0,
                    'reference_type' => 'stock_count',
                    'reference_id' => null,
                    'notes' => $count['notes'] ?? 'Stock count',
                ]);

                app(AuditLogService::class)->log(
                    'inventory.stock_counted',
                    'InventoryItem',
                    $item->id,
                    ['current_stock' => $oldQuantity],
                    ['current_stock' => $item->current_stock],
                    ['movement_id' => $movement->id],
                    $request,
                );

                $adjustments[] = [
                    'item_id' => $item->id,
                    'difference' => $difference,
                    'balance_after' => $item->current_stock,
                ];
            }
        });

        return response()->json([
            'adjustments' => $adjustments,
        ]);
    }

    public function lowStock()
    {
        $items = InventoryItem::whereNotNull('reorder_point')
            ->whereRaw('COALESCE(current_stock, 0) <= reorder_point')
            ->orderBy('name')
            ->get();

        return response()->json(['items' => $items]);
    }

    public function priceHistory($id)
    {
        $items = PurchaseItem::with('purchase.supplier')
            ->where('inventory_item_id', $id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(function ($item) {
                return [
                    'purchase_id' => $item->purchase_id,
                    'supplier' => $item->purchase?->supplier?->name,
                    'unit_cost' => $item->unit_cost,
                    'quantity' => $item->quantity,
                    'purchase_date' => $item->purchase?->purchase_date?->toDateString(),
                ];
            });

        return response()->json(['history' => $items]);
    }

    public function cheapestSupplier($id)
    {
        $record = PurchaseItem::select(
            'purchases.supplier_id',
            DB::raw('MIN(purchase_items.unit_cost) as min_cost'),
        )
            ->join('purchases', 'purchases.id', '=', 'purchase_items.purchase_id')
            ->where('purchase_items.inventory_item_id', $id)
            ->groupBy('purchases.supplier_id')
            ->orderBy('min_cost')
            ->first();

        if (!$record || !$record->supplier_id) {
            return response()->json(['supplier' => null]);
        }

        $supplier = Supplier::find($record->supplier_id);

        return response()->json([
            'supplier' => $supplier ? [
                'id' => $supplier->id,
                'name' => $supplier->name,
                'min_cost' => (float) $record->min_cost,
            ] : null,
        ]);
    }
}
