<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * What a shop usually sells us.
 *
 * Owner, 2026-09-14: "can u add a feature where shop is selected, its most
 * frequent item appears for easier selection." The buying screen used to
 * open on an empty search box however many times the same twelve things had
 * been bought from the same corner shop. This is the list those twelve
 * come from: the items on this supplier's past orders, most often first,
 * each with what was bought last time so a tap can fill the line.
 */
class SupplierFrequentItemsController extends Controller
{
    /** GET /purchases/frequent-items?supplier_id=… or ?supplier_name=… */
    public function index(Request $request): JsonResponse
    {
        $v = $request->validate([
            'supplier_id' => 'nullable|integer',
            'supplier_name' => 'nullable|string|max:255',
            'limit' => 'nullable|integer|min:1|max:100',
        ]);

        $supplier = null;
        if (!empty($v['supplier_id'])) {
            $supplier = Supplier::find($v['supplier_id']);
        } elseif (trim((string) ($v['supplier_name'] ?? '')) !== '') {
            // The buying screen holds a typed name, not an id; the same fold
            // SupplierResolver uses to find the supplier when the order saves.
            $supplier = Supplier::whereRaw('LOWER(name) = ?', [mb_strtolower(trim((string) $v['supplier_name']))])->first();
        }

        if ($supplier === null) {
            return response()->json(['supplier' => null, 'items' => []]);
        }

        $limit = (int) ($v['limit'] ?? 30);

        // Most orders first, then most recent: the thing bought every week
        // beats the thing bought once last month, and among equals the one
        // bought last is the likeliest to be bought again.
        $rows = DB::table('purchase_items')
            ->join('purchases', 'purchases.id', '=', 'purchase_items.purchase_id')
            ->where('purchases.supplier_id', $supplier->id)
            ->where('purchases.status', '!=', 'cancelled')
            ->whereNull('purchases.deleted_at')
            ->whereNotNull('purchase_items.inventory_item_id')
            ->groupBy('purchase_items.inventory_item_id')
            ->selectRaw('purchase_items.inventory_item_id, COUNT(DISTINCT purchases.id) as orders, MAX(purchases.purchase_date) as last_date, MAX(purchase_items.id) as last_line_id')
            ->orderByDesc('orders')
            ->orderByDesc('last_date')
            ->limit($limit)
            ->get();

        if ($rows->isEmpty()) {
            return response()->json(['supplier' => ['id' => $supplier->id, 'name' => $supplier->name], 'items' => []]);
        }

        $items = InventoryItem::whereIn('id', $rows->pluck('inventory_item_id'))
            ->where('is_active', true)
            ->get()
            ->keyBy('id');
        $lastLines = DB::table('purchase_items')
            ->whereIn('id', $rows->pluck('last_line_id'))
            ->get()
            ->keyBy('inventory_item_id');

        $out = [];
        foreach ($rows as $row) {
            $item = $items->get($row->inventory_item_id);
            if ($item === null) {
                continue; // archived since — not something to offer
            }
            $last = $lastLines->get($row->inventory_item_id);
            $packSize = $last && $last->pack_size !== null ? (float) $last->pack_size : null;
            $unitCost = $last ? (float) $last->unit_cost : null;

            $out[] = [
                'item' => $item,
                'orders' => (int) $row->orders,
                'last_purchase_date' => $row->last_date ? substr((string) $row->last_date, 0, 10) : null,
                'last_brand' => $last?->brand ?: null,
                'last_pack_name' => $last?->pack_name,
                'last_pack_size' => $packSize,
                // What one box cost, when it came in one — the figure somebody
                // types on a line bought by the box.
                'last_pack_cost' => $packSize !== null && $packSize > 0 && $unitCost !== null ? round($unitCost * $packSize, 2) : null,
                'last_unit_cost' => $unitCost !== null ? round($unitCost, 6) : null,
                // How many were bought, in whatever the line was counted in.
                'last_quantity' => $last
                    ? ($last->pack_quantity !== null ? (float) $last->pack_quantity : (float) $last->quantity)
                    : null,
            ];
        }

        return response()->json([
            'supplier' => ['id' => $supplier->id, 'name' => $supplier->name],
            'items' => $out,
        ]);
    }
}
