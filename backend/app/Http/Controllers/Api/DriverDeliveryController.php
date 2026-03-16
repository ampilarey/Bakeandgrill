<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeliveryDriver;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DriverDeliveryController extends Controller
{
    private const ACTIVE_STATUSES = ['out_for_delivery', 'picked_up', 'on_the_way'];

    private const VALID_TRANSITIONS = [
        'out_for_delivery' => 'picked_up',
        'picked_up'        => 'on_the_way',
        'on_the_way'       => 'delivered',
    ];

    /**
     * GET /api/driver/deliveries
     * Active deliveries assigned to the authenticated driver.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var DeliveryDriver $driver */
        $driver = $request->user();

        $orders = Order::with(['orderItems.item', 'customer'])
            ->where('delivery_driver_id', $driver->id)
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->orderBy('driver_assigned_at', 'desc')
            ->get()
            ->map(fn(Order $o) => $this->orderSummary($o));

        return response()->json(['deliveries' => $orders]);
    }

    /**
     * GET /api/driver/deliveries/history
     * Past deliveries (delivered/completed), paginated.
     */
    public function history(Request $request): JsonResponse
    {
        /** @var DeliveryDriver $driver */
        $driver = $request->user();

        $validated = $request->validate([
            'date'     => ['nullable', 'date'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Order::with(['orderItems.item', 'customer'])
            ->where('delivery_driver_id', $driver->id)
            ->whereIn('status', ['delivered', 'completed']);

        if (!empty($validated['date'])) {
            $query->whereDate('delivered_at', $validated['date']);
        }

        $orders = $query
            ->orderBy('delivered_at', 'desc')
            ->paginate($validated['per_page'] ?? 20);

        return response()->json([
            'deliveries' => $orders->map(fn(Order $o) => $this->orderSummary($o)),
            'meta'       => [
                'current_page' => $orders->currentPage(),
                'last_page'    => $orders->lastPage(),
                'total'        => $orders->total(),
            ],
        ]);
    }

    /**
     * GET /api/driver/deliveries/{order}
     * Full detail of a single delivery.
     */
    public function show(Request $request, Order $order): JsonResponse
    {
        /** @var DeliveryDriver $driver */
        $driver = $request->user();

        if ((int) $order->delivery_driver_id !== $driver->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $order->load(['orderItems.item', 'orderItems.variant', 'orderItems.modifiers', 'customer']);

        return response()->json(['delivery' => $this->orderDetail($order)]);
    }

    /**
     * PATCH /api/driver/deliveries/{order}/status
     * Update delivery status with validated state transitions.
     */
    public function updateStatus(Request $request, Order $order): JsonResponse
    {
        /** @var DeliveryDriver $driver */
        $driver = $request->user();

        if ((int) $order->delivery_driver_id !== $driver->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $validated = $request->validate([
            'status' => ['required', 'string', 'in:picked_up,on_the_way,delivered'],
        ]);

        $newStatus = $validated['status'];
        $expectedNext = self::VALID_TRANSITIONS[$order->status] ?? null;

        if ($expectedNext !== $newStatus) {
            return response()->json([
                'message' => "Cannot transition from '{$order->status}' to '{$newStatus}'.",
            ], 422);
        }

        $updateData = ['status' => $newStatus];

        if ($newStatus === 'picked_up') {
            $updateData['picked_up_at'] = now();
        } elseif ($newStatus === 'delivered') {
            $updateData['delivered_at'] = now();
        }

        $order->update($updateData);

        return response()->json([
            'delivery' => [
                'id'           => $order->id,
                'status'       => $order->status,
                'picked_up_at' => $order->picked_up_at?->toIso8601String(),
                'delivered_at' => $order->delivered_at?->toIso8601String(),
            ],
        ]);
    }

    /**
     * GET /api/driver/stats
     * Delivery count and timing stats for the authenticated driver.
     */
    public function stats(Request $request): JsonResponse
    {
        /** @var DeliveryDriver $driver */
        $driver = $request->user();

        $base = Order::where('delivery_driver_id', $driver->id)
            ->whereIn('status', ['delivered', 'completed']);

        $today = (clone $base)->whereDate('delivered_at', today())->count();
        $week  = (clone $base)->whereBetween('delivered_at', [now()->startOfWeek(), now()->endOfWeek()])->count();
        $month = (clone $base)->whereMonth('delivered_at', now()->month)
            ->whereYear('delivered_at', now()->year)->count();

        // Average delivery time (assigned → delivered) in minutes
        $avgMinutes = Order::where('delivery_driver_id', $driver->id)
            ->whereIn('status', ['delivered', 'completed'])
            ->whereNotNull('driver_assigned_at')
            ->whereNotNull('delivered_at')
            ->selectRaw('AVG(TIMESTAMPDIFF(MINUTE, driver_assigned_at, delivered_at)) as avg_minutes')
            ->value('avg_minutes');

        // Total delivery fees earned
        $totalFees = Order::where('delivery_driver_id', $driver->id)
            ->whereIn('status', ['delivered', 'completed'])
            ->sum('delivery_fee');

        return response()->json([
            'stats' => [
                'today'            => $today,
                'this_week'        => $week,
                'this_month'       => $month,
                'avg_minutes'      => $avgMinutes ? round((float) $avgMinutes) : null,
                'total_fees_mvr'   => round((float) $totalFees, 2),
            ],
        ]);
    }

    private function orderSummary(Order $order): array
    {
        return [
            'id'                => $order->id,
            'status'            => $order->status,
            'total'             => (float) $order->total,
            'delivery_fee'      => (float) ($order->delivery_fee ?? 0),
            'delivery_address'  => $order->delivery_address,
            'delivery_area'     => $order->delivery_area,
            'delivery_building' => $order->delivery_building,
            'delivery_floor'    => $order->delivery_floor,
            'delivery_notes'    => $order->delivery_notes,
            'customer_name'     => $order->customer_name,
            'customer_phone'    => $order->customer_phone,
            'driver_assigned_at' => $order->driver_assigned_at?->toIso8601String(),
            'picked_up_at'      => $order->picked_up_at?->toIso8601String(),
            'delivered_at'      => $order->delivered_at?->toIso8601String(),
            'item_count'        => $order->orderItems->count(),
        ];
    }

    private function orderDetail(Order $order): array
    {
        return array_merge($this->orderSummary($order), [
            'items' => $order->orderItems->map(fn($item) => [
                'id'        => $item->id,
                'name'      => $item->item?->name ?? $item->name,
                'quantity'  => (int) $item->quantity,
                'unit_price' => (float) $item->unit_price,
                'total_price' => (float) $item->total_price,
                'variant'   => $item->variant?->name,
                'modifiers' => $item->modifiers?->pluck('name') ?? [],
                'notes'     => $item->notes,
            ]),
            'customer' => $order->customer ? [
                'id'    => $order->customer->id,
                'name'  => $order->customer->name,
                'phone' => $order->customer->phone,
            ] : null,
        ]);
    }
}
