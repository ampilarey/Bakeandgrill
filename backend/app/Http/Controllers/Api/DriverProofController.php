<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeliveryDriver;
use App\Models\Order;
use App\Services\MenuImageProcessor;
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

        // Re-encoded: no GPS of the customer's door behind a public link, and
        // a phone-sized picture rather than the camera's (media audit, 2026-10-01).
        $stored = app(MenuImageProcessor::class)->storeAttachment($validated['photo'], 'delivery-proofs/' . now()->format('Y/m'), 1600);
        $previous = $order->proof_of_delivery_path;
        $order->update(['proof_of_delivery_path' => $stored['path']]);
        if (is_string($previous) && $previous !== '' && $previous !== $stored['path']) {
            Storage::disk('public')->delete($previous); // a retaken proof replaces the old one
        }
        $path = $stored['path'];

        return response()->json([
            'message' => 'Proof of delivery saved.',
            'proof_url' => Storage::disk('public')->url($path),
        ]);
    }
}
