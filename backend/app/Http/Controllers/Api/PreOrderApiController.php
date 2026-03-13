<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Item;
use App\Models\PreOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PreOrderApiController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'items'            => 'required|array|min:1',
            'items.*.item_id'  => 'required|integer|exists:items,id',
            'items.*.quantity' => 'required|integer|min:1|max:50',
            'fulfillment_date' => 'required|date|after:' . now()->addHours(24)->toIso8601String(),
            'customer_notes'   => 'nullable|string|max:1000',
        ]);

        $customer = $request->user();

        // Defensive: EnsureCustomerToken middleware already enforces this.
        if (! $customer instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $itemsData = [];
        $subtotal  = 0;

        foreach ($request->items as $line) {
            $item = Item::find($line['item_id']);
            if (! $item) {
                continue;
            }

            $lineTotal  = (float) $item->base_price * (int) $line['quantity'];
            $subtotal  += $lineTotal;

            $itemsData[] = [
                'item_id'  => $item->id,
                'name'     => $item->name,
                'quantity' => (int) $line['quantity'],
                'price'    => (float) $item->base_price,
                'total'    => $lineTotal,
            ];
        }

        if (empty($itemsData)) {
            return response()->json(['message' => 'No valid items provided.'], 422);
        }

        $preOrder = PreOrder::create([
            'order_number'     => 'PRE-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6)),
            'customer_id'      => $customer->id,
            'customer_name'    => $customer->name ?? $customer->phone,
            'customer_phone'   => $customer->phone,
            'customer_email'   => $customer->email ?? null,
            'fulfillment_date' => $request->fulfillment_date,
            'items'            => $itemsData,
            'subtotal'         => $subtotal,
            'total'            => $subtotal,
            'status'           => 'pending',
            'customer_notes'   => $request->customer_notes,
        ]);

        return response()->json(['pre_order' => $preOrder], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $customer = $request->user();

        // Defensive: EnsureCustomerToken middleware already enforces this.
        if (! $customer instanceof Customer) {
            return response()->json(['message' => 'Forbidden — customer access only.'], 403);
        }

        $preOrders = PreOrder::where('customer_id', $customer->id)
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        return response()->json(['data' => $preOrders]);
    }
}
