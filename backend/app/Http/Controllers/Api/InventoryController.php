<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Inventory\DTOs\StockLevelChangedData;
use App\Domains\Inventory\Events\StockLevelChanged;
use App\Domains\Inventory\Services\RestockIntelligenceService;
use App\Domains\Inventory\Services\StockVariancePolicy;
use App\Http\Controllers\Controller;
use App\Http\Requests\AdjustInventoryRequest;
use App\Http\Requests\StockCountRequest;
use App\Http\Requests\StoreInventoryItemRequest;
use App\Http\Requests\UpdateInventoryItemRequest;
use App\Models\InventoryItem;
use App\Models\InventoryReorderAlert;
use App\Models\PurchaseItem;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InventoryController extends Controller
{
    public function __construct(
        private readonly RestockIntelligenceService $restock,
    ) {}

    public function index(Request $request)
    {
        $query = InventoryItem::query()->with('category:id,name');

        if ($request->boolean('active_only')) {
            $query->where('is_active', true);
        }

        if ($request->filled('category_id')) {
            $query->where('inventory_category_id', (int) $request->query('category_id'));
        }

        if ($request->boolean('low_stock') || $request->query('low_stock') === '1') {
            $query->whereNotNull('reorder_point')
                ->whereColumn('current_stock', '<=', 'reorder_point');
        }

        if ($request->filled('search')) {
            $request->validate(['search' => 'sometimes|string|max:100']);
            $search = substr((string) $request->query('search', ''), 0, 100);
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

    public function show(Request $request, $id)
    {
        $item = InventoryItem::with('category:id,name')->findOrFail($id);

        $movements = $item->stockMovements()
            ->with('user:id,name')
            ->orderByDesc('id')
            ->paginate(min(max((int) $request->query('per_page', 50), 10), 100));

        return response()->json([
            'item' => $item,
            'movements' => [
                'data' => $movements->items(),
                'current_page' => $movements->currentPage(),
                'last_page' => $movements->lastPage(),
                'total' => $movements->total(),
            ],
        ]);
    }

    public function update(UpdateInventoryItemRequest $request, $id)
    {
        $item = InventoryItem::findOrFail($id);
        $wasExcluded = (bool) $item->restock_excluded;
        $item->update($request->validated());

        $resolvedAlerts = 0;
        if (!$wasExcluded && (bool) $item->restock_excluded) {
            $resolvedAlerts = $this->restock->resolveOpenAlertsForItems([(int) $item->id]);
        }

        return response()->json([
            'item' => $item,
            'resolved_alerts' => $resolvedAlerts,
        ]);
    }

    public function adjust(AdjustInventoryRequest $request, $id)
    {
        $validated = $request->validated();

        // S5: a write-down worth real money says why, the same rule as a count.
        $subject = InventoryItem::findOrFail($id);
        $adjustCost = isset($validated['unit_cost'])
            ? (float) $validated['unit_cost']
            : (float) ($subject->unit_cost ?? 0);
        if (trim((string) ($validated['notes'] ?? '')) === ''
            && StockVariancePolicy::needsReason((float) $validated['quantity'], $adjustCost)) {
            throw ValidationException::withMessages(['notes' => [sprintf(
                'This adjustment is worth MVR %s. A reason is needed at MVR %s or more.',
                number_format(StockVariancePolicy::varianceValueMvr((float) $validated['quantity'], $adjustCost), 2),
                number_format(StockVariancePolicy::thresholdMvr(), 2),
            )]]);
        }

        [$item, $movement] = DB::transaction(function () use ($validated, $id, $request) {
            $item = InventoryItem::lockForUpdate()->findOrFail($id);
            $oldStock = (float) ($item->current_stock ?? 0);
            $quantity = (float) $validated['quantity'];

            $item->current_stock = $oldStock + $quantity;
            $item->save();

            event(new StockLevelChanged(new StockLevelChangedData(
                itemId: $item->id,
                itemName: $item->name,
                oldQuantity: $oldStock,
                newQuantity: (float) $item->current_stock,
                reason: 'adjustment',
            )));

            $movementPayload = [
                'inventory_item_id' => $item->id,
                'user_id' => $request->user()?->id,
                'type' => $validated['type'],
                'quantity' => $quantity,
                'balance_after' => $item->current_stock,
                'unit_cost' => $validated['unit_cost'] ?? null,
                'reference_type' => 'manual',
                'reference_id' => null,
                'notes' => $validated['notes'] ?? null,
            ];
            if (!empty($validated['idempotency_key'])) {
                if (StockMovement::where('idempotency_key', $validated['idempotency_key'])->exists()) {
                    return [$item->fresh(), StockMovement::where('idempotency_key', $validated['idempotency_key'])->first()];
                }
                $movementPayload['idempotency_key'] = $validated['idempotency_key'];
            }

            $movement = StockMovement::create($movementPayload);

            app(AuditLogService::class)->log(
                'inventory.adjusted',
                'InventoryItem',
                $item->id,
                ['current_stock' => $oldStock],
                ['current_stock' => $item->current_stock],
                ['movement_id' => $movement->id, 'type' => $validated['type']],
                $request,
            );

            return [$item, $movement];
        });

        return response()->json([
            'item' => $item,
            'movement' => $movement,
        ]);
    }

    public function stockCount(StockCountRequest $request)
    {
        $validated = $request->validated();
        $adjustments = [];

        // Stock audit, 2026-09-03 (S2): a count is a money event, not a typing
        // exercise. Every line is valued at what the item costs, and one worth
        // more than the house threshold has to say why before it is written.
        $threshold = StockVariancePolicy::thresholdMvr();
        $missingReasons = [];
        foreach ($validated['counts'] as $index => $count) {
            $item = InventoryItem::find($count['inventory_item_id']);
            if ($item === null) {
                continue;
            }
            $difference = (float) $count['quantity'] - (float) ($item->current_stock ?? 0);
            $note = trim((string) ($count['notes'] ?? ''));
            if ($note === '' && StockVariancePolicy::needsReason($difference, (float) ($item->unit_cost ?? 0))) {
                $missingReasons["counts.$index.notes"] = [sprintf(
                    '%s is out by %s %s — MVR %s. A reason is needed for a difference worth MVR %s or more.',
                    $item->name,
                    rtrim(rtrim(number_format(abs($difference), 3, '.', ''), '0'), '.'),
                    $item->unit ?? 'units',
                    number_format(StockVariancePolicy::varianceValueMvr($difference, (float) ($item->unit_cost ?? 0)), 2),
                    number_format($threshold, 2),
                )];
            }
        }
        if ($missingReasons !== []) {
            throw ValidationException::withMessages($missingReasons);
        }

        DB::transaction(function () use ($validated, $request, &$adjustments) {
            foreach ($validated['counts'] as $count) {
                $item = InventoryItem::lockForUpdate()->findOrFail($count['inventory_item_id']);
                $newQuantity = (float) $count['quantity'];
                $oldQuantity = (float) ($item->current_stock ?? 0);
                $difference = $newQuantity - $oldQuantity;
                $unitCost = (float) ($item->unit_cost ?? 0);
                $varianceValue = StockVariancePolicy::varianceValueMvr($difference, $unitCost);

                $item->current_stock = $newQuantity;
                $item->save();

                $movement = StockMovement::create([
                    'inventory_item_id' => $item->id,
                    'user_id' => $request->user()?->id,
                    'type' => 'adjustment',
                    'quantity' => $difference,
                    'balance_after' => $item->current_stock,
                    'unit_cost' => $unitCost,
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
                    [
                        'movement_id' => $movement->id,
                        'difference' => $difference,
                        'variance_value_mvr' => $varianceValue,
                        'reason' => $count['notes'] ?? null,
                    ],
                    $request,
                );

                $adjustments[] = [
                    'item_id' => $item->id,
                    'name' => $item->name,
                    'difference' => $difference,
                    'balance_after' => $item->current_stock,
                    'unit_cost' => $unitCost,
                    'variance_value_mvr' => $varianceValue,
                ];
            }
        });

        return response()->json([
            'adjustments' => $adjustments,
            'variance_value_mvr' => round(array_sum(array_column($adjustments, 'variance_value_mvr')), 2),
            'reason_threshold_mvr' => $threshold,
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
                    'purchase_number' => $item->purchase?->purchase_number,
                    'supplier' => $item->purchase?->supplier?->name,
                    'unit_cost' => $item->unit_cost,
                    'quantity' => $item->quantity,
                    'purchase_date' => $item->purchase?->purchase_date?->toDateString(),
                ];
            });

        return response()->json(['history' => $items]);
    }

    /**
     * Who sold this cheapest, lately.
     *
     * Stock audit, 2026-09-03 (S3): this read `purchase_items` alone, so every
     * price paid through the buying list — most of the day-to-day buying, which
     * records into `supplier_price_history` — was invisible to it. It also took
     * an all-time minimum, so a price from a year ago beat a real quote from
     * this week. Both paths write price history, so that is the source now, and
     * it is windowed: `?days=` (default 90, 0 for all time).
     */
    public function cheapestSupplier(Request $request, $id)
    {
        $days = (int) $request->query('days', '90');
        $days = $days > 0 ? min($days, 3650) : 0;

        $query = SupplierPriceHistory::query()
            ->select('supplier_id', DB::raw('MIN(unit_price) as min_cost'), DB::raw('MAX(recorded_at) as last_seen'))
            ->where('inventory_item_id', $id)
            ->whereNotNull('supplier_id')
            ->where('unit_price', '>', 0)
            ->groupBy('supplier_id')
            ->orderBy('min_cost');

        $windowed = (clone $query)
            ->where('recorded_at', '>=', now()->subDays($days)->toDateString());

        $record = $days > 0 ? $windowed->first() : null;
        $fromWindow = $record !== null;
        if ($record === null) {
            // Nothing bought lately — fall back to the whole history rather
            // than pretending nobody has ever sold it.
            $record = $query->first();
        }

        if (!$record || !$record->supplier_id) {
            return response()->json(['supplier' => null]);
        }

        $supplier = Supplier::find($record->supplier_id);

        return response()->json([
            'supplier' => $supplier ? [
                'id' => $supplier->id,
                'name' => $supplier->name,
                'min_cost' => (float) $record->min_cost,
                'last_seen' => $record->last_seen,
                'within_window' => $fromWindow,
                'window_days' => $days,
            ] : null,
        ]);
    }

    /**
     * Acknowledge / dismiss an open reorder alert (does not change stock).
     */
    public function resolveReorderAlert(int $id): JsonResponse
    {
        $alert = InventoryReorderAlert::query()->findOrFail($id);

        if ($alert->resolved_at !== null) {
            return response()->json([
                'alert' => $alert,
                'message' => 'Alert was already resolved.',
            ]);
        }

        $alert->update(['resolved_at' => now()]);

        return response()->json([
            'alert' => $alert->fresh(),
            'message' => 'Reorder alert resolved.',
        ]);
    }
}
