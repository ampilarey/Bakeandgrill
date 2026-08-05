<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Customer;
use App\Models\Item;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;

class FavoritesController extends Controller
{
    // ── List favorites ────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $customer = $request->user();

        // Defensive: EnsureCustomerToken middleware already enforces this.
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $favoriteIds = DB::table('customer_favorites')
            ->where('customer_id', $customer->id)
            ->pluck('item_id')
            ->toArray();

        $items = Item::whereIn('id', $favoriteIds)
            ->with('category:id,name')
            ->where('is_active', true)
            ->get();

        return response()->json(['favorites' => $items]);
    }

    // ── Toggle favourite (add if absent, remove if present) ──────────────────

    public function toggle(Request $request, int $itemId): JsonResponse
    {
        $customer = $request->user();

        // Defensive: EnsureCustomerToken middleware already enforces this.
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $item = Item::findOrFail($itemId);

        $exists = DB::table('customer_favorites')
            ->where('customer_id', $customer->id)
            ->where('item_id', $item->id)
            ->exists();

        if ($exists) {
            DB::table('customer_favorites')
                ->where('customer_id', $customer->id)
                ->where('item_id', $item->id)
                ->delete();

            return response()->json(['favorited' => false, 'item_id' => $item->id]);
        }

        DB::table('customer_favorites')->insert([
            'customer_id' => $customer->id,
            'item_id' => $item->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['favorited' => true, 'item_id' => $item->id]);
    }

    // ── Quick reorder: re-add items from a past order into a new cart ─────────
    // Returns item details that the frontend can use to populate the cart.

    public function reorder(Request $request, int $orderId): JsonResponse
    {
        $customer = $request->user();

        // Defensive: EnsureCustomerToken middleware already enforces this.
        // Also explicitly scopes order lookup to this customer's orders.
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $order = Order::where('id', $orderId)
            ->where('customer_id', $customer->id)
            ->with(['items.item.platterGroups', 'items.modifiers'])
            ->firstOrFail();

        // Group platter child lines (parent_order_item_id) under their parent when present.
        // Until Stage 4c ships the column, children stay empty and is_platter forces the picker.
        $byParent = [];
        $hasParentColumn = \Illuminate\Support\Facades\Schema::hasColumn('order_items', 'parent_order_item_id');
        if ($hasParentColumn) {
            foreach ($order->items as $oi) {
                $parentId = $oi->parent_order_item_id ?? null;
                if ($parentId) {
                    $byParent[$parentId][] = $oi;
                }
            }
        }

        $cartItems = $order->items
            ->filter(function ($oi) use ($hasParentColumn) {
                if (!$hasParentColumn) {
                    return true;
                }

                return empty($oi->parent_order_item_id);
            })
            ->map(function ($oi) use ($byParent) {
                $isPlatter = (bool) ($oi->item?->isPlatter());
                $children = collect($byParent[$oi->id] ?? [])->map(fn ($child) => [
                    'item_id' => $child->item_id,
                    'item_name' => $child->item_name,
                    'quantity' => $child->quantity,
                    'unit_price' => $child->unit_price,
                    'surcharge' => (float) $child->unit_price,
                ])->values()->all();

                return [
                    'item_id' => $oi->item_id,
                    'item_name' => $oi->item_name,
                    'quantity' => $oi->quantity,
                    'unit_price' => $oi->unit_price,
                    'variant_id' => $oi->variant_id,
                    'is_platter' => $isPlatter,
                    'children' => $children,
                    'modifiers' => $oi->modifiers->map(fn ($m) => [
                        'id' => $m->modifier_id ?? $m->id,
                        'name' => $m->name,
                        'price' => $m->price ?? 0,
                    ]),
                ];
            })
            ->values();

        return response()->json([
            'items' => $cartItems,
            'original_type' => $order->type,
        ]);
    }
}
