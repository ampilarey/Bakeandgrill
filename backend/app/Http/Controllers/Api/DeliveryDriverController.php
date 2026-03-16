<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\DeliveryDriver;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;

/**
 * Manage delivery drivers and assign them to orders.
 */
class DeliveryDriverController extends Controller
{
    // ── Drivers CRUD ──────────────────────────────────────────────────────────

    public function index(): JsonResponse
    {
        $drivers = DeliveryDriver::orderBy('name')->get()->map(fn(DeliveryDriver $d) => $this->driverData($d));

        return response()->json(['drivers' => $drivers]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'         => ['required', 'string', 'max:100'],
            'phone'        => ['nullable', 'string', 'max:30'],
            'is_active'    => ['boolean'],
            'vehicle_type' => ['nullable', 'string', 'max:30'],
            'pin'          => ['nullable', 'string', 'digits_between:4,6'],
        ]);

        if (!empty($validated['pin'])) {
            $validated['pin'] = Hash::make($validated['pin']);
        }

        $driver = DeliveryDriver::create($validated);

        return response()->json(['driver' => $this->driverData($driver)], 201);
    }

    public function update(Request $request, DeliveryDriver $driver): JsonResponse
    {
        $validated = $request->validate([
            'name'         => ['sometimes', 'string', 'max:100'],
            'phone'        => ['nullable', 'string', 'max:30'],
            'is_active'    => ['boolean'],
            'vehicle_type' => ['nullable', 'string', 'max:30'],
            'pin'          => ['nullable', 'string', 'digits_between:4,6'],
        ]);

        if (array_key_exists('pin', $validated)) {
            $validated['pin'] = $validated['pin'] ? Hash::make($validated['pin']) : null;
        }

        $driver->update($validated);

        return response()->json(['driver' => $this->driverData($driver)]);
    }

    private function driverData(DeliveryDriver $driver): array
    {
        return [
            'id'           => $driver->id,
            'name'         => $driver->name,
            'phone'        => $driver->phone,
            'is_active'    => $driver->is_active,
            'vehicle_type' => $driver->vehicle_type,
            'has_pin'      => (bool) $driver->getAttributes()['pin'],
            'last_login_at' => $driver->last_login_at?->toIso8601String(),
        ];
    }

    public function destroy(DeliveryDriver $driver): JsonResponse
    {
        // Unassign from active orders before deleting
        Order::where('delivery_driver_id', $driver->id)
            ->whereNotIn('status', ['completed', 'cancelled'])
            ->update(['delivery_driver_id' => null, 'driver_assigned_at' => null]);

        $driver->delete();

        return response()->json(['message' => 'Driver deleted.']);
    }

    // ── Assignment ────────────────────────────────────────────────────────────

    /**
     * POST /api/delivery/orders/{order}/assign-driver
     * Body: { driver_id: int|null }
     */
    public function assignDriver(Request $request, Order $order): JsonResponse
    {
        $validated = $request->validate([
            'driver_id' => ['nullable', 'integer', 'exists:delivery_drivers,id'],
        ]);

        $driverId = $validated['driver_id'] ?? null;

        $order->update([
            'delivery_driver_id' => $driverId,
            'driver_assigned_at' => $driverId ? now() : null,
            // Automatically update status when a driver is assigned to out_for_delivery
            'status'             => $driverId && $order->status === 'ready' ? 'out_for_delivery' : $order->status,
        ]);

        $order->load('deliveryDriver');

        return response()->json([
            'order' => [
                'id'                  => $order->id,
                'status'              => $order->status,
                'delivery_driver_id'  => $order->delivery_driver_id,
                'driver_assigned_at'  => $order->driver_assigned_at?->toIso8601String(),
                'driver'              => $order->deliveryDriver ? [
                    'id'    => $order->deliveryDriver->id,
                    'name'  => $order->deliveryDriver->name,
                    'phone' => $order->deliveryDriver->phone,
                ] : null,
            ],
        ]);
    }
}
