<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\PurchaseItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Every line ever bought, flat.
 *
 * Owner, 2026-09-16: "where i can see all the items purchased from a
 * specific store and specific brand?" Nowhere. The orders page showed a
 * shop's orders one document at a time; the supplier page showed prices one
 * item at a time; the item page showed brands one item at a time. The rows
 * were all there — every purchase line carries the shop, the brand, the
 * pack and the price — and no screen laid them side by side.
 *
 * This hands the admin the rows for a date window and lets the table do the
 * narrowing: shop, brand, item, pack, status are all columns with a box
 * under them. Quantity and price come per base unit, as stored, and per
 * pack, as typed, so "2 cases at MVR 415" reads as it was bought.
 */
class PurchaseLinesController extends Controller
{
    private const MAX_ROWS = 3000;

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $from = $validated['from'] ?? now()->subDays(90)->toDateString();
        $to = $validated['to'] ?? now()->toDateString();

        $rows = PurchaseItem::query()
            ->join('purchases', 'purchases.id', '=', 'purchase_items.purchase_id')
            ->join('inventory_items', 'inventory_items.id', '=', 'purchase_items.inventory_item_id')
            ->leftJoin('suppliers', 'suppliers.id', '=', 'purchases.supplier_id')
            ->whereNull('purchases.deleted_at')
            ->whereBetween('purchases.purchase_date', [$from, $to])
            ->orderByDesc('purchases.purchase_date')
            ->orderByDesc('purchases.id')
            ->orderBy('purchase_items.id')
            ->limit(self::MAX_ROWS + 1)
            ->select([
                'purchase_items.id',
                'purchase_items.purchase_id',
                'purchases.purchase_number',
                'purchases.purchase_date',
                'purchases.status',
                'purchases.supplier_id',
                DB::raw('COALESCE(suppliers.name, purchases.supplier_name_text) as supplier'),
                'purchase_items.inventory_item_id',
                'inventory_items.name as item',
                'inventory_items.unit',
                'purchase_items.brand',
                'purchase_items.pack_name',
                'purchase_items.pack_size',
                'purchase_items.pack_quantity',
                'purchase_items.quantity',
                'purchase_items.received_quantity',
                'purchase_items.unit_cost',
                'purchase_items.gst_rate_bp',
            ])
            ->get();

        $truncated = $rows->count() > self::MAX_ROWS;
        $lines = $rows->take(self::MAX_ROWS)->map(function ($r) {
            $unitCost = (float) $r->unit_cost;
            $quantity = (float) $r->quantity;
            $packSize = $r->pack_size !== null ? (float) $r->pack_size : null;

            return [
                'id' => (int) $r->id,
                'purchase_id' => (int) $r->purchase_id,
                'purchase_number' => $r->purchase_number,
                'purchase_date' => $r->purchase_date instanceof \DateTimeInterface
                    ? $r->purchase_date->format('Y-m-d')
                    : substr((string) $r->purchase_date, 0, 10),
                'status' => $r->status,
                'supplier_id' => $r->supplier_id !== null ? (int) $r->supplier_id : null,
                'supplier' => $r->supplier ?: null,
                'item_id' => (int) $r->inventory_item_id,
                'item' => $r->item,
                'unit' => $r->unit,
                'brand' => $r->brand ?: null,
                'pack_name' => $r->pack_name ?: null,
                'pack_size' => $packSize,
                'pack_quantity' => $r->pack_quantity !== null ? (float) $r->pack_quantity : null,
                'quantity' => $quantity,
                'received_quantity' => (float) ($r->received_quantity ?? 0),
                'unit_cost' => round($unitCost, 6),
                // What one pack cost, as it was typed; null for a loose line.
                'pack_cost' => $packSize !== null && $packSize > 0 ? round($unitCost * $packSize, 2) : null,
                'line_total' => round($quantity * $unitCost, 2),
                'gst_rate_bp' => $r->gst_rate_bp !== null ? (int) $r->gst_rate_bp : null,
            ];
        })->values();

        return response()->json([
            'lines' => $lines,
            'window' => ['from' => $from, 'to' => $to],
            // The window holds more than a table should carry: narrow the dates.
            'truncated' => $truncated,
        ]);
    }
}
