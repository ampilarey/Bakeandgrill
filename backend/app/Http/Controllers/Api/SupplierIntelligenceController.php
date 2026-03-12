<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Purchase;
use App\Models\Supplier;
use App\Models\SupplierPriceHistory;
use App\Models\SupplierRating;
use App\Models\SupplierPerformanceCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class SupplierIntelligenceController extends Controller
{
    // ──────────────────────────────────────────────────────────
    // Rate a supplier after a purchase
    // ──────────────────────────────────────────────────────────

    public function rate(Request $request, int $supplierId): JsonResponse
    {
        $supplier = Supplier::findOrFail($supplierId);

        $validated = $request->validate([
            'purchase_id'      => ['nullable', 'integer', 'exists:purchases,id'],
            'quality_score'    => ['required', 'integer', 'min:1', 'max:5'],
            'delivery_score'   => ['required', 'integer', 'min:1', 'max:5'],
            'accuracy_score'   => ['required', 'integer', 'min:1', 'max:5'],
            'price_score'      => ['required', 'integer', 'min:1', 'max:5'],
            'notes'            => ['nullable', 'string', 'max:1000'],
        ]);

        $validated['supplier_id'] = $supplierId;
        $validated['user_id']     = $request->user()->id;

        $rating = SupplierRating::create($validated);

        $this->refreshPerformanceCache($supplierId);

        return response()->json(['rating' => $this->formatRating($rating)], 201);
    }

    public function ratings(int $supplierId): JsonResponse
    {
        $supplier = Supplier::findOrFail($supplierId);

        $ratings = SupplierRating::where('supplier_id', $supplierId)
            ->with(['user:id,name', 'purchase:id,purchase_number'])
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json([
            'data' => collect($ratings->items())->map(fn($r) => $this->formatRating($r)),
            'meta' => ['current_page' => $ratings->currentPage(), 'last_page' => $ratings->lastPage(), 'total' => $ratings->total()],
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Supplier performance summary
    // ──────────────────────────────────────────────────────────

    public function performance(int $supplierId): JsonResponse
    {
        $supplier    = Supplier::findOrFail($supplierId);
        $cache       = SupplierPerformanceCache::firstOrNew(['supplier_id' => $supplierId]);
        $isStale     = !$cache->refreshed_at || $cache->refreshed_at->lt(now()->subHours(6));

        if ($isStale) {
            $cache = $this->refreshPerformanceCache($supplierId);
        }

        return response()->json([
            'supplier_id'      => $supplierId,
            'supplier_name'    => $supplier->name,
            'purchase_count'   => $cache->purchase_count,
            'total_spend'      => (float) $cache->total_spend,
            'avg_quality'      => $cache->avg_quality ? (float) $cache->avg_quality : null,
            'avg_delivery'     => $cache->avg_delivery ? (float) $cache->avg_delivery : null,
            'avg_accuracy'     => $cache->avg_accuracy ? (float) $cache->avg_accuracy : null,
            'avg_price_score'  => $cache->avg_price_score ? (float) $cache->avg_price_score : null,
            'overall_rating'   => $cache->overall_rating ? (float) $cache->overall_rating : null,
            'refreshed_at'     => $cache->refreshed_at,
        ]);
    }

    public function allPerformance(Request $request): JsonResponse
    {
        $perfs = SupplierPerformanceCache::with('supplier:id,name,is_active')
            ->orderByDesc('total_spend')
            ->get();

        return response()->json([
            'suppliers' => $perfs->map(fn($p) => [
                'supplier_id'    => $p->supplier_id,
                'supplier_name'  => $p->supplier?->name,
                'is_active'      => $p->supplier?->is_active,
                'purchase_count' => $p->purchase_count,
                'total_spend'    => (float) $p->total_spend,
                'overall_rating' => $p->overall_rating ? (float) $p->overall_rating : null,
                'avg_quality'    => $p->avg_quality ? (float) $p->avg_quality : null,
                'avg_delivery'   => $p->avg_delivery ? (float) $p->avg_delivery : null,
            ]),
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Price comparison for an inventory item across suppliers
    // ──────────────────────────────────────────────────────────

    public function priceComparison(int $inventoryItemId): JsonResponse
    {
        // Latest price per supplier
        $latestPrices = SupplierPriceHistory::where('inventory_item_id', $inventoryItemId)
            ->with('supplier:id,name,is_active')
            ->select('supplier_id', DB::raw('MAX(recorded_at) as latest_date'))
            ->groupBy('supplier_id')
            ->get()
            ->map(function ($row) use ($inventoryItemId) {
                $detail = SupplierPriceHistory::where('supplier_id', $row->supplier_id)
                    ->where('inventory_item_id', $inventoryItemId)
                    ->where('recorded_at', $row->latest_date)
                    ->with('supplier:id,name,is_active')
                    ->first();
                return $detail;
            })
            ->filter()
            ->sortBy('unit_price')
            ->values();

        return response()->json([
            'inventory_item_id' => $inventoryItemId,
            'prices' => $latestPrices->map(fn($p) => [
                'supplier_id'   => $p->supplier_id,
                'supplier_name' => $p->supplier?->name,
                'is_active'     => $p->supplier?->is_active,
                'unit_price'    => (float) $p->unit_price,
                'unit'          => $p->unit,
                'recorded_at'   => $p->recorded_at?->toDateString(),
            ]),
            'cheapest' => $latestPrices->first() ? [
                'supplier_id'   => $latestPrices->first()->supplier_id,
                'supplier_name' => $latestPrices->first()->supplier?->name,
                'unit_price'    => (float) $latestPrices->first()->unit_price,
            ] : null,
        ]);
    }

    public function priceHistory(int $supplierId, int $inventoryItemId): JsonResponse
    {
        $history = SupplierPriceHistory::where('supplier_id', $supplierId)
            ->where('inventory_item_id', $inventoryItemId)
            ->orderBy('recorded_at')
            ->get();

        return response()->json([
            'supplier_id'       => $supplierId,
            'inventory_item_id' => $inventoryItemId,
            'history' => $history->map(fn($h) => [
                'unit_price'  => (float) $h->unit_price,
                'unit'        => $h->unit,
                'recorded_at' => $h->recorded_at?->toDateString(),
                'purchase_id' => $h->purchase_id,
            ]),
        ]);
    }

    // ──────────────────────────────────────────────────────────
    // Refresh performance cache for a supplier
    // ──────────────────────────────────────────────────────────

    public function refreshCache(int $supplierId): JsonResponse
    {
        Supplier::findOrFail($supplierId);
        $cache = $this->refreshPerformanceCache($supplierId);

        return response()->json(['message' => 'Cache refreshed.', 'refreshed_at' => $cache->refreshed_at]);
    }

    private function refreshPerformanceCache(int $supplierId): SupplierPerformanceCache
    {
        $purchases = Purchase::where('supplier_id', $supplierId)->selectRaw('COUNT(*) as cnt, SUM(total) as spend')->first();

        $ratings = SupplierRating::where('supplier_id', $supplierId)
            ->selectRaw('AVG(quality_score) as q, AVG(delivery_score) as d, AVG(accuracy_score) as a, AVG(price_score) as p')
            ->first();

        $overall = null;
        if ($ratings && $ratings->q) {
            $overall = round(((float)$ratings->q + (float)$ratings->d + (float)$ratings->a + (float)$ratings->p) / 4, 2);
        }

        return SupplierPerformanceCache::updateOrCreate(
            ['supplier_id' => $supplierId],
            [
                'purchase_count'  => (int) ($purchases->cnt ?? 0),
                'total_spend'     => (float) ($purchases->spend ?? 0),
                'avg_quality'     => $ratings->q ? round((float) $ratings->q, 2) : null,
                'avg_delivery'    => $ratings->d ? round((float) $ratings->d, 2) : null,
                'avg_accuracy'    => $ratings->a ? round((float) $ratings->a, 2) : null,
                'avg_price_score' => $ratings->p ? round((float) $ratings->p, 2) : null,
                'overall_rating'  => $overall,
                'refreshed_at'    => now(),
            ]
        );
    }

    private function formatRating(SupplierRating $r): array
    {
        return [
            'id'             => $r->id,
            'quality_score'  => $r->quality_score,
            'delivery_score' => $r->delivery_score,
            'accuracy_score' => $r->accuracy_score,
            'price_score'    => $r->price_score,
            'overall'        => round(($r->quality_score + $r->delivery_score + $r->accuracy_score + $r->price_score) / 4, 2),
            'notes'          => $r->notes,
            'purchase'       => $r->purchase ? ['id' => $r->purchase->id, 'number' => $r->purchase->purchase_number] : null,
            'rated_by'       => $r->user?->name,
            'created_at'     => $r->created_at,
        ];
    }
}
