<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Inventory\DTOs\StockLevelChangedData;
use App\Domains\Inventory\Events\StockLevelChanged;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\StockMovement;
use App\Models\WasteLog;
use App\Services\StockManagementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class WasteLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = WasteLog::with('item:id,name', 'inventoryItem:id,name', 'user:id,name')
            ->orderByDesc('created_at');

        if ($from = $request->query('from')) {
            $query->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $query->whereDate('created_at', '<=', $to);
        }

        $paginator = $query->paginate(20);

        return response()->json([
            'data' => collect($paginator->items())->map(fn ($w) => $this->format($w)),
            'meta' => ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(), 'total' => $paginator->total()],
            'total_cost' => WasteLog::when($from = $request->query('from'), fn ($q) => $q->whereDate('created_at', '>=', $from))
                ->when($to = $request->query('to'), fn ($q) => $q->whereDate('created_at', '<=', $to))
                ->sum('cost_estimate'),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'item_id' => ['nullable', 'integer', 'exists:items,id'],
            'inventory_item_id' => ['nullable', 'integer', 'exists:inventory_items,id'],
            'quantity' => ['required', 'numeric', 'min:0.001'],
            'unit' => ['sometimes', 'string', 'max:20'],
            'cost_estimate' => ['nullable', 'numeric', 'min:0'],
            'reason' => ['required', 'in:spoilage,over_prep,drop,expired,quality,other'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        // At least one item reference is required
        if (empty($validated['item_id']) && empty($validated['inventory_item_id'])) {
            return response()->json([
                'message' => 'Either item_id or inventory_item_id is required.',
                'errors' => ['item_id' => ['At least one item reference is required.']],
            ], 422);
        }

        $validated['user_id'] = $request->user()->id;

        $wasteLog = DB::transaction(function () use ($validated): WasteLog {
            if (!empty($validated['inventory_item_id'])) {
                $invItem = InventoryItem::lockForUpdate()->find($validated['inventory_item_id']);
                if ($invItem) {
                    $validated['cost_estimate'] = round((float) ($invItem->unit_cost ?? 0) * (float) $validated['quantity'], 2);
                }
            }

            $wasteLog = WasteLog::create($validated);

            // Deduct from raw inventory stock and record movement
            if ($wasteLog->inventory_item_id) {
                $invItem = InventoryItem::lockForUpdate()->find($wasteLog->inventory_item_id);
                if ($invItem) {
                    $oldStock = (float) $invItem->current_stock;

                    DB::table('inventory_items')
                        ->where('id', $invItem->id)
                        ->decrement('current_stock', $validated['quantity']);

                    $invItem->refresh();

                    StockMovement::create([
                        'idempotency_key' => 'waste_log:'.$wasteLog->id.':inv',
                        'inventory_item_id' => $invItem->id,
                        'user_id' => $validated['user_id'],
                        'type' => 'waste',
                        'quantity' => -$validated['quantity'],
                        'balance_after' => $invItem->current_stock,
                        'unit_cost' => $invItem->unit_cost ?? 0,
                        'reference_type' => 'waste_log',
                        'reference_id' => $wasteLog->id,
                        'notes' => "Waste: {$validated['reason']}",
                    ]);

                    DB::afterCommit(function () use ($invItem, $oldStock): void {
                        event(new StockLevelChanged(new StockLevelChangedData(
                            itemId: $invItem->id,
                            itemName: $invItem->name,
                            oldQuantity: $oldStock,
                            newQuantity: (float) $invItem->current_stock,
                            reason: 'waste',
                        )));
                    });
                }
            }

            // Menu-item waste: decrement prepared stock when the item tracks it
            if ($wasteLog->item_id && empty($wasteLog->inventory_item_id)) {
                $menuItem = Item::query()->find($wasteLog->item_id);
                if (
                    $menuItem
                    && $menuItem->track_stock
                    && $menuItem->availability_type === 'stock_based'
                ) {
                    $qty = (int) max(1, (int) round((float) $validated['quantity']));
                    app(StockManagementService::class)->adjustItemPreparedStock(
                        $menuItem,
                        -$qty,
                        (int) $validated['user_id'],
                        'waste_log:'.$wasteLog->id.':prepared',
                        'Waste: '.$validated['reason'],
                    );
                    if (empty($validated['cost_estimate'])) {
                        $wasteLog->update([
                            'cost_estimate' => round((float) ($menuItem->cost ?? 0) * $qty, 2),
                        ]);
                    }
                }
            }

            return $wasteLog->fresh(['item', 'inventoryItem', 'user']);
        });

        return response()->json(['waste_log' => $this->format($wasteLog)], 201);
    }

    public function summary(Request $request): JsonResponse
    {
        $from = $request->query('from');
        $to = $request->query('to');

        $base = WasteLog::query();
        if ($from) {
            $base->whereDate('created_at', '>=', $from);
        }
        if ($to) {
            $base->whereDate('created_at', '<=', $to);
        }

        $byReason = (clone $base)
            ->select('reason', DB::raw('COUNT(*) as entries'), DB::raw('COALESCE(SUM(cost_estimate),0) as cost'))
            ->groupBy('reason')
            ->orderByDesc('cost')
            ->get()
            ->map(fn ($row) => [
                'reason' => (string) $row->reason,
                'entries' => (int) $row->entries,
                'cost' => round((float) $row->cost, 2),
            ])
            ->values()
            ->all();

        $totalCost = (float) (clone $base)->sum('cost_estimate');
        $totalEntries = (int) (clone $base)->count();

        $dailyTrend = (clone $base)
            ->selectRaw('DATE(created_at) as date, COALESCE(SUM(cost_estimate), 0) as cost')
            ->groupByRaw('DATE(created_at)')
            ->orderByRaw('DATE(created_at)')
            ->get()
            ->map(fn ($row) => [
                'date' => (string) $row->date,
                'cost' => round((float) $row->cost, 2),
            ])
            ->values()
            ->all();

        $menuTop = (clone $base)
            ->whereNotNull('item_id')
            ->join('items', 'items.id', '=', 'waste_logs.item_id')
            ->select('items.id', 'items.name', DB::raw('COUNT(*) as entries'), DB::raw('COALESCE(SUM(waste_logs.cost_estimate), 0) as cost'))
            ->groupBy('items.id', 'items.name')
            ->orderByDesc('cost')
            ->limit(10)
            ->get()
            ->map(fn ($row) => [
                'key' => 'menu-' . $row->id,
                'name' => (string) $row->name,
                'entries' => (int) $row->entries,
                'cost' => round((float) $row->cost, 2),
            ])
            ->all();

        $invTop = (clone $base)
            ->whereNotNull('inventory_item_id')
            ->join('inventory_items', 'inventory_items.id', '=', 'waste_logs.inventory_item_id')
            ->select('inventory_items.id', 'inventory_items.name', DB::raw('COUNT(*) as entries'), DB::raw('COALESCE(SUM(waste_logs.cost_estimate), 0) as cost'))
            ->groupBy('inventory_items.id', 'inventory_items.name')
            ->orderByDesc('cost')
            ->limit(10)
            ->get()
            ->map(fn ($row) => [
                'key' => 'inv-' . $row->id,
                'name' => (string) $row->name,
                'entries' => (int) $row->entries,
                'cost' => round((float) $row->cost, 2),
            ])
            ->all();

        $topItems = collect([...$menuTop, ...$invTop])
            ->sortByDesc('cost')
            ->take(10)
            ->values()
            ->all();

        return response()->json([
            'from' => $from,
            'to' => $to,
            'total_cost' => round($totalCost, 2),
            'total_entries' => $totalEntries,
            'by_reason' => $byReason,
            'daily_trend' => $dailyTrend,
            'top_items' => $topItems,
        ]);
    }

    private function format(WasteLog $w): array
    {
        return [
            'id' => $w->id,
            'item' => $w->item ? ['id' => $w->item->id, 'name' => $w->item->name] : null,
            'inventory_item' => $w->inventoryItem ? ['id' => $w->inventoryItem->id, 'name' => $w->inventoryItem->name] : null,
            'quantity' => (float) $w->quantity,
            'unit' => $w->unit,
            'cost_estimate' => $w->cost_estimate ? (float) $w->cost_estimate : null,
            'reason' => $w->reason,
            'notes' => $w->notes,
            'logged_by' => $w->user?->name,
            'created_at' => $w->created_at,
        ];
    }
}
