<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\WasteLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class WasteLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = WasteLog::with('item:id,name', 'inventoryItem:id,name', 'user:id,name')
            ->orderByDesc('created_at');

        if ($from = $request->query('from')) $query->whereDate('created_at', '>=', $from);
        if ($to   = $request->query('to'))   $query->whereDate('created_at', '<=', $to);

        $paginator = $query->paginate(20);

        return response()->json([
            'data' => collect($paginator->items())->map(fn($w) => $this->format($w)),
            'meta' => ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(), 'total' => $paginator->total()],
            'total_cost' => WasteLog::when($from = $request->query('from'), fn($q) => $q->whereDate('created_at', '>=', $from))
                ->when($to = $request->query('to'), fn($q) => $q->whereDate('created_at', '<=', $to))
                ->sum('cost_estimate'),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'item_id'           => ['nullable', 'integer', 'exists:items,id'],
            'inventory_item_id' => ['nullable', 'integer', 'exists:inventory_items,id'],
            'quantity'          => ['required', 'numeric', 'min:0.001'],
            'unit'              => ['sometimes', 'string', 'max:20'],
            'cost_estimate'     => ['nullable', 'numeric', 'min:0'],
            'reason'            => ['required', 'in:spoilage,over_prep,drop,expired,quality,other'],
            'notes'             => ['nullable', 'string', 'max:500'],
        ]);

        $validated['user_id'] = $request->user()->id;
        $wasteLog = WasteLog::create($validated);

        return response()->json(['waste_log' => $this->format($wasteLog)], 201);
    }

    private function format(WasteLog $w): array
    {
        return [
            'id'          => $w->id,
            'item'        => $w->item ? ['id' => $w->item->id, 'name' => $w->item->name] : null,
            'inventory_item' => $w->inventoryItem ? ['id' => $w->inventoryItem->id, 'name' => $w->inventoryItem->name] : null,
            'quantity'    => (float) $w->quantity,
            'unit'        => $w->unit,
            'cost_estimate' => $w->cost_estimate ? (float) $w->cost_estimate : null,
            'reason'      => $w->reason,
            'notes'       => $w->notes,
            'logged_by'   => $w->user?->name,
            'created_at'  => $w->created_at,
        ];
    }
}
