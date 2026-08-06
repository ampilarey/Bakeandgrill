<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Delivery\DTOs\DeliveryDetails;
use App\Domains\Delivery\Services\DeliveryFeeCalculator;
use App\Domains\Kitchen\Services\KitchenMenuResolver;
use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Domains\Orders\Support\EffectiveDiscount;
use App\Domains\System\Services\ServiceAvailabilityService;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\CustomerAddressService;
use App\Services\DeliveryGateService;
use App\Services\OnlineOrderingGateService;
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
        private KitchenMenuResolver $kitchenMenuResolver,
        private DeliveryGateService $deliveryGate,
        private OrderTotalsCalculator $calculator,
    ) {}

    /**
     * POST /api/orders/delivery
     *
     * Create a delivery order. Requires customer auth or staff auth.
     * Items validated server-side. Delivery fee calculated and added to total.
     */
    public function store(Request $request): JsonResponse
    {
        // Global gate first (master switch + schedule + override)
        // Staff POS phone orders bypass online + delivery gates.
        $authUser = $request->user();
        $isCustomer = $authUser instanceof \App\Models\Customer;
        $isStaff = $authUser instanceof \App\Models\User;

        // Staff creating a delivery sale is still a POS sale — same
        // permission as ringing any other order (route is shared with
        // customers, so this cannot live in route middleware).
        if ($isStaff && !$authUser->hasPermission('pos.ring_sales')) {
            abort(403, 'You do not have permission to create delivery orders.');
        }

        if (!$isStaff) {
            // Overlay guards emit 503; legacy gate services keep their 422s.
            app(ServiceAvailabilityService::class)->assertAvailable('online_checkout');
            app(ServiceAvailabilityService::class)->assertAvailable('online_delivery');
        }

        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'required|integer|exists:items,id',
            'items.*.variant_id' => 'nullable|integer|exists:variants,id',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.modifiers' => 'nullable|array',
            'items.*.modifiers.*.modifier_id' => 'required|integer|exists:modifiers,id',
            'items.*.modifiers.*.quantity' => 'nullable|integer|min:1',
            'items.*.notes' => 'nullable|string|max:255',
            'items.*.children' => 'nullable|array|max:50',
            'items.*.children.*.item_id' => 'required_with:items.*.children|integer|exists:items,id',
            'items.*.children.*.quantity' => 'required_with:items.*.children|integer|min:1|max:99',
            'items.*.children.*.group_id' => 'nullable|integer|exists:platter_groups,id',
            'items.*.children.*.surcharge' => 'nullable|numeric|min:0',

            // Delivery-specific
            'delivery_address_line1' => 'required|string|max:255',
            'delivery_address_line2' => 'nullable|string|max:255',
            'delivery_island' => 'required|string|max:100',
            'delivery_contact_name' => 'required|string|max:100',
            'delivery_contact_phone' => ['required', 'string', 'max:30', 'regex:/^(\+?960)?[379]\d{6}$/'],
            'delivery_notes' => 'nullable|string|max:500',
            'delivery_location_link' => 'nullable|url|max:2048',
            'desired_eta' => 'nullable|date|after:now',
            'save_address' => 'sometimes|boolean',
            'address_label' => 'nullable|string|max:60',
            'branch_id' => 'nullable|integer',
            'customer_notes' => 'nullable|string|max:500',
            'customer_id' => 'nullable|integer|exists:customers,id',
            'device_identifier' => 'nullable|string|max:255',
            'print' => 'sometimes|boolean',
            'discount_amount' => 'nullable|numeric|min:0',
            'idempotency_key' => 'nullable|string|max:64',
            'ticket_name' => 'nullable|string|max:80',
            'ticket_note' => 'nullable|string|max:255',
            'fulfil_date' => 'nullable|date_format:Y-m-d',
            'collect_on' => 'nullable|string|in:today,tomorrow',
            'reward_claims' => 'nullable|array|max:10',
            'reward_claims.*.promotion_id' => 'required_with:reward_claims|integer|min:1',
            'reward_claims.*.item_id' => 'required_with:reward_claims|integer|min:1',
        ]);

        // Recompute tomorrow collection server-side (never trust the browser date).
        $fulfil = app(\App\Services\OrderFulfilDateService::class);
        $resolvedFulfil = $fulfil->resolveForCustomerOrder(
            isset($validated['fulfil_date']) ? (string) $validated['fulfil_date'] : null,
            isset($validated['collect_on']) ? (string) $validated['collect_on'] : null,
        );
        unset($validated['collect_on']);
        if ($resolvedFulfil !== null) {
            if ($isCustomer) {
                $itemIds = app(\App\Domains\Menu\Services\PlatterOrderService::class)
                    ->collectItemIdsFromPayload($validated['items'] ?? []);
                $fulfil->assertAllItemsAllowTomorrow($itemIds);
            }
            $validated['fulfil_date'] = $resolvedFulfil;
        } else {
            unset($validated['fulfil_date']);
        }

        if (!$isStaff) {
            // Same-day blocked while closed; tomorrow + allow_pre_order may proceed.
            app(OnlineOrderingGateService::class)->assertOpenOrTomorrowCollect(
                $validated['fulfil_date'] ?? null,
            );

            $island = is_string($validated['delivery_island'] ?? null)
                ? $validated['delivery_island']
                : null;
            if (($validated['fulfil_date'] ?? null) !== null) {
                // Per-mode tomorrow delivery gate (master already checked above).
                app(\App\Services\FeatureGateService::class)->assertOpen(
                    'tomorrow_delivery',
                    'Delivery for tomorrow is not available right now.',
                );
                // Tomorrow order: schedule window / capacity don't apply.
                $this->deliveryGate->assertDeliveryOpenForTomorrow($island);
            } else {
                $this->deliveryGate->assertDeliveryOpen($island);
            }
        }

        $delivery = DeliveryDetails::fromArray($validated);

        // Distinguish customer vs staff user:
        // Customers authenticate via customer tokens; staff via User models.
        $payload = array_merge($validated, [
            'type' => 'delivery',
            'customer_id' => $isCustomer ? $authUser->id : ($validated['customer_id'] ?? null),
        ], $delivery->toArray());

        // Pass null as the "staff user" when request is from a customer
        // to avoid setting user_id = customer.id (FK would fail). Customers
        // must never send a manual discount — strip it before create.
        $staffUser = $isCustomer ? null : $authUser;
        if ($isCustomer) {
            $payload['discount_amount'] = 0;
        }

        $idempotencyKey = $payload['idempotency_key'] ?? null;
        if (is_string($idempotencyKey) && $idempotencyKey !== '') {
            $existing = Order::where('idempotency_key', $idempotencyKey)->first();
            if ($existing) {
                $existing->load(['items.modifiers']);

                return response()->json(['order' => $existing], 200);
            }
        }

        $order = DB::transaction(function () use ($payload, $staffUser, $delivery): Order {
            $order = $this->orderCreation->createFromPayload($payload, $staffUser);

            // Free-delivery threshold uses discounted merchandise, not raw subtotal.
            $feeLaar = $this->feeCalculator->calculateLaar(
                $delivery->island,
                EffectiveDiscount::discountedSubtotalLaarFromOrder($order),
            );
            $feeMvr = round($feeLaar / 100, 2);

            // Persist delivery fields + fee on the order row first …
            $order->update(array_merge($delivery->toArray(), [
                'delivery_fee' => $feeMvr,
                'delivery_fee_laar' => $feeLaar,
            ]));

            // … then run the calculator so that subtotal_laar, tax_laar, and every
            // other total field are consistent. OrderTotalsCalculator already reads
            // delivery_fee_laar and adds it on top of the item grand total.
            $order = $this->calculator->recalculateAndPersist($order->fresh());

            return $order->load(['items.modifiers']);
        });

        $customerId = $order->customer_id;
        if ($customerId && ($validated['save_address'] ?? false)) {
            $customer = \App\Models\Customer::find($customerId);
            if ($customer) {
                app(CustomerAddressService::class)->upsertFromDeliveryOrder($customer, [
                    'label' => $validated['address_label'] ?? null,
                    'address_line1' => $delivery->addressLine1,
                    'address_line2' => $delivery->addressLine2,
                    'island' => $delivery->island,
                    'contact_name' => $delivery->contactName,
                    'contact_phone' => $delivery->contactPhone,
                    'notes' => $delivery->notes,
                    'location_link' => $delivery->locationLink,
                ]);
            }
        }

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
        // Customers can only update their own orders
        $user = $request->user();
        if ($user instanceof \App\Models\Customer && $order->customer_id !== $user->id) {
            abort(403, 'You do not own this order.');
        }

        // Staff need an order-management permission to patch delivery details.
        if ($user instanceof \App\Models\User
            && !$user->hasPermission('orders.manage')
            && !$user->hasPermission('pos.ring_sales')) {
            abort(403, 'You do not have permission to update delivery orders.');
        }

        if (!in_array($order->status, ['pending', 'draft', 'payment_pending'], true)) {
            throw ValidationException::withMessages([
                'status' => "Cannot update delivery details once order is {$order->status}.",
            ]);
        }

        $validated = $request->validate([
            'delivery_address_line1' => 'sometimes|string|max:255',
            'delivery_address_line2' => 'nullable|string|max:255',
            'delivery_island' => 'sometimes|string|max:100',
            'delivery_contact_name' => 'sometimes|string|max:100',
            'delivery_contact_phone' => ['sometimes', 'string', 'max:30', 'regex:/^(\+?960)?[379]\d{6}$/'],
            'delivery_notes' => 'nullable|string|max:500',
            'delivery_location_link' => 'nullable|url|max:2048',
            'delivery_eta_at' => 'nullable|date|after:now',
        ]);

        // Recalculate delivery fee if island changed (discounted base for free-delivery threshold).
        if (isset($validated['delivery_island'])) {
            // Re-run the same eligibility gate as store(): a customer must not
            // be able to move an order into an island or window we cannot
            // serve. Staff edits (phone corrections) stay ungated.
            if ($user instanceof \App\Models\Customer) {
                if ($order->fulfil_date !== null) {
                    $this->deliveryGate->assertDeliveryOpenForTomorrow($validated['delivery_island']);
                } else {
                    $this->deliveryGate->assertDeliveryOpen($validated['delivery_island']);
                }
            }

            $feeLaar = $this->feeCalculator->calculateLaar(
                $validated['delivery_island'],
                EffectiveDiscount::discountedSubtotalLaarFromOrder($order),
            );
            $validated['delivery_fee'] = round($feeLaar / 100, 2);
            $validated['delivery_fee_laar'] = $feeLaar;
        }

        $order->update($validated);

        // Re-run the calculator so that subtotal_laar, tax_laar, and total stay
        // consistent with any fee change. If no fee changed, this is a cheap no-op.
        $order = $this->calculator->recalculateAndPersist($order->fresh());

        return response()->json(['order' => $order->load(['items.modifiers'])]);
    }
}
