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
        /** @var Customer $customer */
        $customer   = $request->user();
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
        /** @var Customer $customer */
        $customer = $request->user();

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
            'item_id'     => $item->id,
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);

        return response()->json(['favorited' => true, 'item_id' => $item->id]);
    }

    // ── Quick reorder: re-add items from a past order into a new cart ─────────
    // Returns item details that the frontend can use to populate the cart.

    public function reorder(Request $request, int $orderId): JsonResponse
    {
        /** @var Customer $customer */
        $customer = $request->user();

        $order = Order::where('id', $orderId)
            ->where('customer_id', $customer->id)
            ->with('items.item', 'items.modifiers')
            ->firstOrFail();

        $cartItems = $order->items->map(function ($oi) {
            return [
                'item_id'    => $oi->item_id,
                'item_name'  => $oi->item_name,
                'quantity'   => $oi->quantity,
                'unit_price' => $oi->unit_price,
                'modifiers'  => $oi->modifiers->map(fn($m) => [
                    'id'    => $m->modifier_id ?? $m->id,
                    'name'  => $m->name,
                    'price' => $m->price ?? 0,
                ]),
            ];
        });

        return response()->json([
            'items'         => $cartItems,
            'original_type' => $order->type,
        ]);
    }
}
