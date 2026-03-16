<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeliveryDriver;
use App\Models\DriverLocation;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class DriverLocationController extends Controller
{
    /**
     * POST /api/driver/location
     * Accept batch location updates from the driver app.
     * Stores in DB and caches latest position.
     */
    public function store(Request $request): JsonResponse
    {
        /** @var DeliveryDriver $driver */
        $driver = $request->user();

        $validated = $request->validate([
            'locations'               => ['required', 'array', 'min:1', 'max:50'],
            'locations.*.latitude'    => ['required', 'numeric', 'between:-90,90'],
            'locations.*.longitude'   => ['required', 'numeric', 'between:-180,180'],
            'locations.*.heading'     => ['nullable', 'numeric'],
            'locations.*.speed'       => ['nullable', 'numeric', 'min:0'],
            'locations.*.accuracy'    => ['nullable', 'numeric', 'min:0'],
            'locations.*.recorded_at' => ['required', 'date'],
        ]);

        $rows = collect($validated['locations'])->map(fn(array $loc) => [
            'delivery_driver_id' => $driver->id,
            'latitude'           => $loc['latitude'],
            'longitude'          => $loc['longitude'],
            'heading'            => $loc['heading'] ?? null,
            'speed'              => $loc['speed'] ?? null,
            'accuracy'           => $loc['accuracy'] ?? null,
            'recorded_at'        => $loc['recorded_at'],
            'created_at'         => now(),
        ]);

        DriverLocation::insert($rows->toArray());

        // Cache the latest position (15 minute TTL — location expires when driver stops)
        $latest = $rows->sortByDesc('recorded_at')->first();
        Cache::put("driver_location:{$driver->id}", [
            'latitude'    => $latest['latitude'],
            'longitude'   => $latest['longitude'],
            'heading'     => $latest['heading'],
            'speed'       => $latest['speed'],
            'recorded_at' => $latest['recorded_at'],
        ], now()->addMinutes(15));

        return response()->json(['message' => 'Location updated.'], 201);
    }

    /**
     * GET /api/driver/deliveries/{order}/location
     * Returns the driver's latest cached location for an active delivery.
     * Accessible by the order's customer (customer token) or staff.
     */
    public function forOrder(Request $request, Order $order): JsonResponse
    {
        // Only expose location while the driver is actively delivering
        if (!in_array($order->status, ['picked_up', 'on_the_way'], true)) {
            return response()->json(['location' => null, 'message' => 'Driver not yet on the way.']);
        }

        if (!$order->delivery_driver_id) {
            return response()->json(['location' => null]);
        }

        $user = $request->user();

        // Authorise: customer token must own the order, staff or driver tokens always pass
        if ($user instanceof \App\Models\Customer && (int) $order->customer_id !== $user->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $cached = Cache::get("driver_location:{$order->delivery_driver_id}");

        if (!$cached) {
            // Fallback to DB
            $dbLocation = DriverLocation::where('delivery_driver_id', $order->delivery_driver_id)
                ->orderByDesc('recorded_at')
                ->first();

            if ($dbLocation) {
                $cached = [
                    'latitude'    => (float) $dbLocation->latitude,
                    'longitude'   => (float) $dbLocation->longitude,
                    'heading'     => $dbLocation->heading,
                    'speed'       => $dbLocation->speed,
                    'recorded_at' => $dbLocation->recorded_at->toIso8601String(),
                ];
            }
        }

        $driver = $order->deliveryDriver;

        return response()->json([
            'location' => $cached,
            'driver'   => $driver ? [
                'name'  => $driver->name,
                'phone' => $driver->phone,
            ] : null,
        ]);
    }
}
