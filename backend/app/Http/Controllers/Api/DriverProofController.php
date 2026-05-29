<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeliveryDriver;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DriverProofController extends Controller
{
    /**
     * POST /api/driver/deliveries/{order}/proof
     * Upload proof-of-delivery photo when marking delivered.
     */
    public function store(Request $request, Order $order): JsonResponse
    {
        /** @var DeliveryDriver $driver */
        $driver = $request->user();

        if ((int) $order->delivery_driver_id !== $driver->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        if ($order->type !== 'delivery') {
            return response()->json(['message' => 'Not a delivery order.'], 422);
        }

        $validated = $request->validate([
            'photo' => 'required|image|max:5120',
        ]);

        $path = $validated['photo']->store('delivery-proofs/' . now()->format('Y/m'), 'public');
        $order->update(['proof_of_delivery_path' => $path]);

        return response()->json([
            'message' => 'Proof of delivery saved.',
            'proof_url' => Storage::disk('public')->url($path),
        ]);
    }
}
