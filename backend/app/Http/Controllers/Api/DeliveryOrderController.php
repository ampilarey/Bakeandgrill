<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Delivery\DTOs\DeliveryDetails;
use App\Domains\Delivery\Services\DeliveryFeeCalculator;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\OrderCreationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Manages delivery order creation and updates.
 *
 * Additive: does NOT modify existing dine_in/takeaway endpoints.
 */
class DeliveryOrderController extends Controller
{
    public function __construct(
        private OrderCreationService $orderCreation,
        private DeliveryFeeCalculator $feeCalculator,
    ) {}

    /**
     * POST /api/orders/delivery
     *
     * Create a delivery order. Requires customer auth or staff auth.
     * Items validated server-side. Delivery fee calculated and added to total.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'required|integer|exists:items,id',
            'items.*.variant_id' => 'nullable|integer|exists:variants,id',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.modifiers' => 'nullable|array',
            'items.*.modifiers.*.modifier_id' => 'required|integer|exists:modifiers,id',
            'items.*.modifiers.*.quantity' => 'nullable|integer|min:1',

            // Delivery-specific
            'delivery_address_line1' => 'required|string|max:255',
            'delivery_address_line2' => 'nullable|string|max:255',
            'delivery_island' => 'required|string|max:100',
            'delivery_contact_name' => 'required|string|max:100',
            'delivery_contact_phone' => 'required|string|max:30',
            'delivery_notes' => 'nullable|string|max:500',
            'desired_eta' => 'nullable|date|after:now',
            'branch_id' => 'nullable|integer',
            'customer_notes' => 'nullable|string|max:500',
        ]);

        $delivery = DeliveryDetails::fromArray($validated);

        // Distinguish customer vs staff user:
        // Customers authenticate via customer tokens; staff via User models.
        $authUser = $request->user();
        $isCustomer = $authUser instanceof \App\Models\Customer;

        $payload = array_merge($validated, [
            'type' => 'delivery',
            'customer_id' => $isCustomer ? $authUser->id : ($validated['customer_id'] ?? null),
        ], $delivery->toArray());

        // Pass null as the "staff user" when request is from a customer
        // to avoid setting user_id = customer.id (FK would fail)
        $staffUser = $isCustomer ? null : $authUser;

        $order = DB::transaction(function () use ($payload, $staffUser, $delivery): Order {
            $order = $this->orderCreation->createFromPayload($payload, $staffUser);

            // Calculate delivery fee and add to order total
            $feeLaar = $this->feeCalculator->calculateLaar(
                $delivery->island,
                (int) (($order->subtotal_laar ?? (int) round($order->subtotal * 100))),
            );
            $feeMvr = round($feeLaar / 100, 2);

            // Persist all delivery fields (address, contact, eta) + fee + updated total
            $order->update(array_merge($delivery->toArray(), [
                'delivery_fee' => $feeMvr,
                'delivery_fee_laar' => $feeLaar,
                'total' => round(($order->total ?? 0) + $feeMvr, 2),
                'total_laar' => ($order->total_laar ?? (int) round($order->total * 100)) + $feeLaar,
            ]));

            return $order->fresh(['items.modifiers']);
        });

        return response()->json(['order' => $order], 201);
    }

    /**
     * PATCH /api/orders/{order}/delivery
     *
     * Update delivery fields before payment/fulfillment.
     * Only allowed while order is in draft/pending status (state machine guard).
     */
    public function update(Request $request, Order $order): JsonResponse
    {
        if (!in_array($order->status, ['pending', 'draft'], true)) {
            throw ValidationException::withMessages([
                'status' => "Cannot update delivery details once order is {$order->status}.",
            ]);
        }

        $validated = $request->validate([
            'delivery_address_line1' => 'sometimes|string|max:255',
            'delivery_address_line2' => 'nullable|string|max:255',
            'delivery_island' => 'sometimes|string|max:100',
            'delivery_contact_name' => 'sometimes|string|max:100',
            'delivery_contact_phone' => 'sometimes|string|max:30',
            'delivery_notes' => 'nullable|string|max:500',
            'delivery_eta_at' => 'nullable|date|after:now',
        ]);

        // Recalculate delivery fee if island changed
        if (isset($validated['delivery_island'])) {
            $feeLaar = $this->feeCalculator->calculateLaar($validated['delivery_island']);
            $validated['delivery_fee'] = round($feeLaar / 100, 2);
            $validated['delivery_fee_laar'] = $feeLaar;

            // Adjust total: remove old fee, add new fee
            $oldFeeLaar = $order->delivery_fee_laar ?? 0;
            $delta = $feeLaar - $oldFeeLaar;
            $validated['total'] = round(($order->total ?? 0) + ($delta / 100), 2);
            $validated['total_laar'] = ($order->total_laar ?? 0) + $delta;
        }

        $order->update($validated);

        return response()->json(['order' => $order->fresh(['items.modifiers'])]);
    }
}
