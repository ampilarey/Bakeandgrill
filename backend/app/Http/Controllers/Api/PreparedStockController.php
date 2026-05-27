<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AdjustPreparedStockRequest;
use App\Models\Item;
use App\Models\Variant;
use App\Services\AuditLogService;
use App\Services\StockManagementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PreparedStockController extends Controller
{
    public function __construct(
        private readonly StockManagementService $stock,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * Menu items / variants that track prepared (ready-made) quantity.
     */
    public function index(): JsonResponse
    {
        $rows = [];

        $items = Item::query()
            ->where('is_active', true)
            ->where('has_variants', false)
            ->where('track_stock', true)
            ->where('availability_type', 'stock_based')
            ->orderBy('name')
            ->get(['id', 'name', 'stock_quantity', 'low_stock_threshold']);

        foreach ($items as $item) {
            $rows[] = [
                'item_id' => $item->id,
                'variant_id' => null,
                'name' => $item->name,
                'stock' => (int) $item->stock_quantity,
                'low_stock_threshold' => (int) $item->low_stock_threshold,
            ];
        }

        $variants = Variant::query()
            ->with('item:id,name,is_active')
            ->where('track_stock', true)
            ->where('is_active', true)
            ->whereHas('item', fn ($q) => $q->where('is_active', true))
            ->orderBy('item_id')
            ->orderBy('sort_order')
            ->get(['id', 'item_id', 'name', 'stock_qty', 'low_stock_threshold']);

        foreach ($variants as $variant) {
            $item = $variant->item;
            if ($item === null) {
                continue;
            }
            $rows[] = [
                'item_id' => $item->id,
                'variant_id' => $variant->id,
                'name' => $item->name . ' — ' . $variant->name,
                'stock' => (int) $variant->stock_qty,
                'low_stock_threshold' => (int) $variant->low_stock_threshold,
            ];
        }

        usort($rows, fn ($a, $b) => strcasecmp($a['name'], $b['name']));

        return response()->json(['items' => $rows]);
    }

    public function adjust(AdjustPreparedStockRequest $request, int $itemId): JsonResponse
    {
        $validated = $request->validated();
        $delta = (int) $validated['delta'];
        $variantId = isset($validated['variant_id']) ? (int) $validated['variant_id'] : null;
        $notes = isset($validated['notes']) && is_string($validated['notes'])
            ? trim($validated['notes'])
            : null;
        if ($notes === '') {
            $notes = null;
        }

        $userId = (int) $request->user()?->id;
        $idempotencyKey = 'prepared:adjust:' . Str::uuid();

        $result = DB::transaction(function () use ($itemId, $variantId, $delta, $userId, $idempotencyKey, $notes, $request) {
            if ($variantId !== null) {
                $variant = Variant::query()
                    ->with('item:id,name')
                    ->where('item_id', $itemId)
                    ->lockForUpdate()
                    ->findOrFail($variantId);

                $before = (int) $variant->stock_qty;
                $updated = $this->stock->adjustVariantPreparedStock(
                    $variant,
                    $delta,
                    $userId,
                    $idempotencyKey,
                    $notes,
                );

                $this->audit->log(
                    'prepared_stock.adjusted',
                    'Variant',
                    $variant->id,
                    ['stock_qty' => $before],
                    ['stock_qty' => (int) $updated->stock_qty],
                    ['delta' => $delta, 'item_id' => $itemId, 'notes' => $notes],
                    $request,
                );

                return [
                    'item_id' => $itemId,
                    'variant_id' => $variant->id,
                    'name' => ($variant->item?->name ?? 'Item') . ' — ' . $variant->name,
                    'stock' => (int) $updated->stock_qty,
                    'low_stock_threshold' => (int) $updated->low_stock_threshold,
                ];
            }

            $item = Item::query()->lockForUpdate()->findOrFail($itemId);
            $before = (int) $item->stock_quantity;
            $updated = $this->stock->adjustItemPreparedStock(
                $item,
                $delta,
                $userId,
                $idempotencyKey,
                $notes,
            );

            $this->audit->log(
                'prepared_stock.adjusted',
                'Item',
                $item->id,
                ['stock_quantity' => $before],
                ['stock_quantity' => (int) $updated->stock_quantity],
                ['delta' => $delta, 'notes' => $notes],
                $request,
            );

            return [
                'item_id' => $item->id,
                'variant_id' => null,
                'name' => $item->name,
                'stock' => (int) $updated->stock_quantity,
                'low_stock_threshold' => (int) $updated->low_stock_threshold,
            ];
        });

        return response()->json([
            'message' => 'Prepared stock updated.',
            'item' => $result,
        ]);
    }
}
