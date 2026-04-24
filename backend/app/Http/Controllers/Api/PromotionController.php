<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderPromotion;
use App\Models\Promotion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PromotionController extends Controller
{
    public function __construct(
        private PromotionEvaluator $evaluator,
        private OrderTotalsCalculator $calculator = new OrderTotalsCalculator,
    ) {}

    /**
     * Validate a promo code (public / customer).
     */
    public function validate(Request $request): JsonResponse
    {
        $request->validate([
            'code' => 'required|string|max:50',
            'order_id' => 'nullable|integer|exists:orders,id',
        ]);

        $orderId = $request->input('order_id');
        // Eager-load items.item so PromotionEvaluator doesn't trigger N+1 queries per category
        $order = $orderId ? Order::with('items.item')->findOrFail($orderId) : null;

        $user = $request->user();
        $isCustomerActor = $user?->tokenCan('customer');

        // Prevent cross-order IDOR: customers may only validate against their own orders
        if ($order && $isCustomerActor) {
            if ((int) $order->customer_id !== (int) $user->id) {
                return response()->json(['valid' => false, 'message' => 'Order not found.'], 404);
            }
        }

        // Resolve the customer ID for per-customer usage evaluation:
        // - For customer actors: their own ID
        // - For staff actors with an order: the order owner's customer_id
        // - Otherwise null (unauthenticated / no order context)
        $customerId = $isCustomerActor
            ? $user->id
            : ($order?->customer_id ?? null);

        if (! $order) {
            $promo = Promotion::where('code', strtoupper(trim($request->input('code'))))->first();
            if (! $promo || ! $promo->isValid()) {
                return response()->json(['valid' => false, 'message' => 'Promo code is invalid or expired.']);
            }

            return response()->json(['valid' => true, 'message' => 'Promo code is valid.', 'promotion' => $promo->only('name', 'type', 'discount_value', 'scope')]);
        }

        $result = $this->evaluator->evaluate($request->input('code'), $order, $customerId);

        return response()->json([
            'valid' => $result['valid'],
            'message' => $result['message'],
            'discount_laar' => $result['discount_laar'],
            'discount_mvr' => number_format($result['discount_laar'] / 100, 2),
        ]);
    }

    /**
     * Apply a promo code to an order (authenticated).
     *
     * Authorization matrix:
     *   - Customer token: may only apply to their own order.
     *   - Staff token: requires 'promotions.discounts' permission.
     */
    public function applyToOrder(Request $request, int $orderId): JsonResponse
    {
        $request->validate(['code' => 'required|string|max:50']);

        $order = Order::with('items.item')->findOrFail($orderId);

        $user = $request->user();
        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }
        $isCustomerActor = $user->tokenCan('customer');

        if ($isCustomerActor) {
            // Customer IDOR guard — may only modify their own order.
            if ((int) $order->customer_id !== (int) $user->id) {
                return response()->json(['message' => 'Forbidden'], 403);
            }
        } else {
            // Staff actor — must have explicit promotions.discounts permission.
            if (! $user->hasPermission('promotions.discounts')) {
                return response()->json(['message' => 'You do not have permission to apply discounts.'], 403);
            }
        }

        // Block apply on 'partial' — payment has already been collected and
        // lowering the total via a discount would make total < amount paid, causing
        // an accounting discrepancy. Staff must handle adjustments manually.
        if (in_array($order->status, ['paid', 'completed', 'cancelled', 'partial'], true)) {
            return response()->json(['message' => 'Cannot apply promo to this order.'], 422);
        }

        // Resolve customer ID for per-customer usage limit evaluation.
        $customerId = $isCustomerActor ? $user->id : $order->customer_id;

        $result = $this->evaluator->evaluate($request->input('code'), $order, $customerId);

        if (! $result['valid']) {
            return response()->json(['message' => $result['message']], 422);
        }

        $promotion = $result['promotion'];
        $idempotencyKey = 'order-promo:'.$orderId.':'.$promotion->id;

        // Track whether the promo was actually persisted so we can return the
        // correct status if the order was concurrently locked into a terminal state.
        $applied = false;

        DB::transaction(function () use ($order, $orderId, $promotion, $result, $idempotencyKey, &$applied): void {
            // Re-lock the order row inside the transaction to prevent race conditions.
            $order = Order::lockForUpdate()->findOrFail($orderId);

            if (in_array($order->status, ['paid', 'completed', 'cancelled', 'partial'], true)) {
                // Order transitioned to a terminal/partial state between the pre-check and the lock.
                // $applied stays false; caller will receive a 409.
                return;
            }

            $existing = OrderPromotion::where('order_id', $order->id)
                ->whereNotIn('status', ['released'])
                ->first();

            if ($existing && ! $promotion->stackable) {
                $existing->update(['status' => 'released']);
            }

            OrderPromotion::firstOrCreate(
                ['idempotency_key' => $idempotencyKey],
                [
                    'order_id' => $order->id,
                    'promotion_id' => $promotion->id,
                    'discount_laar' => $result['discount_laar'],
                    'status' => 'draft',
                ],
            );

            $totalPromoDiscount = OrderPromotion::where('order_id', $order->id)
                ->where('status', 'draft')
                ->sum('discount_laar');

            $order->update(['promo_discount_laar' => $totalPromoDiscount]);
            $this->calculator->recalculateAndPersist($order);
            $applied = true;
        });

        if (! $applied) {
            return response()->json(['message' => 'Order is no longer modifiable.'], 409);
        }

        return response()->json([
            'message' => $result['message'],
            'discount_laar' => $result['discount_laar'],
            'discount_mvr' => number_format($result['discount_laar'] / 100, 2),
            'promotion_id' => $promotion->id,
        ]);
    }

    /**
     * Remove a promo from an order.
     */
    public function removeFromOrder(Request $request, int $orderId, int $promotionId): JsonResponse
    {
        $user = $request->user();
        $isCustomerActor = $user->tokenCan('customer');

        // Pre-check existence (no lock yet — avoids holding a lock during auth evaluation).
        $order = Order::findOrFail($orderId);

        if ($isCustomerActor) {
            // Customer IDOR guard.
            if ((int) $order->customer_id !== (int) $user->id) {
                return response()->json(['message' => 'Forbidden'], 403);
            }
        } else {
            // Staff actor — must have explicit promotions.discounts permission.
            if (! $user->hasPermission('promotions.discounts')) {
                return response()->json(['message' => 'You do not have permission to apply discounts.'], 403);
            }
        }

        if (in_array($order->status, ['paid', 'completed', 'cancelled'], true)) {
            return response()->json(['message' => 'Cannot modify promo on this order.'], 422);
        }

        // Mirror applyToOrder: lock the row inside the transaction so a concurrent
        // payment cannot mark the order paid between the pre-check and the UPDATE.
        $removed = false;

        DB::transaction(function () use ($orderId, $promotionId, &$removed): void {
            $order = Order::lockForUpdate()->findOrFail($orderId);

            // Re-check terminal state under the lock.
            if (in_array($order->status, ['paid', 'completed', 'cancelled'], true)) {
                return; // $removed stays false; caller returns 409.
            }

            OrderPromotion::where('order_id', $order->id)
                ->where('promotion_id', $promotionId)
                ->where('status', 'draft')
                ->update(['status' => 'released']);

            $totalPromoDiscount = OrderPromotion::where('order_id', $order->id)
                ->where('status', 'draft')
                ->sum('discount_laar');

            $order->update(['promo_discount_laar' => $totalPromoDiscount]);
            $this->calculator->recalculateAndPersist($order);
            $removed = true;
        });

        if (! $removed) {
            return response()->json(['message' => 'Order is no longer modifiable.'], 409);
        }

        return response()->json(['message' => 'Promo removed.']);
    }

    // ─── Admin Endpoints ─────────────────────────────────────────────────────

    public function adminIndex(Request $request): JsonResponse
    {
        $promotions = Promotion::withTrashed()
            ->orderByDesc('created_at')
            ->paginate(50);

        return response()->json($promotions);
    }

    // ─── Internal authorization guard (defense-in-depth) ─────────────────────
    private function authorizeAdminRole(Request $request, string ...$roles): void
    {
        $user = $request->user();
        if (! $user || $user instanceof Customer) {
            abort(403, 'Forbidden.');
        }
        $user->loadMissing('role');
        if (! in_array($user->role?->slug, $roles, true)) {
            abort(403, 'Insufficient role.');
        }
    }

    public function adminStore(Request $request): JsonResponse
    {
        $this->authorizeAdminRole($request, 'manager', 'owner');

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => 'required|string|max:50|unique:promotions,code',
            'type' => 'required|in:percentage,fixed,free_item',
            'discount_value' => 'required|integer|min:0',
            'is_active' => 'boolean',
            'starts_at' => 'nullable|date',
            'expires_at' => 'nullable|date|after:starts_at',
            'max_uses' => 'nullable|integer|min:1',
            'max_uses_per_customer' => 'nullable|integer|min:1',
            'stackable' => 'boolean',
            'min_order_laar' => 'nullable|integer|min:0',
            'scope' => 'in:order,item',
            'restricted_customer_id' => 'nullable|integer|exists:customers,id',
        ]);

        $promotion = Promotion::create($validated);

        return response()->json(['promotion' => $promotion], 201);
    }

    public function adminUpdate(Request $request, int $id): JsonResponse
    {
        $this->authorizeAdminRole($request, 'manager', 'owner');

        $promotion = Promotion::withTrashed()->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'is_active' => 'sometimes|boolean',
            'expires_at' => 'nullable|date',
            'max_uses' => 'nullable|integer|min:1',
            'max_uses_per_customer' => 'nullable|integer|min:1',
            'restricted_customer_id' => 'nullable|integer|exists:customers,id',
        ]);

        $promotion->update($validated);

        return response()->json(['promotion' => $promotion]);
    }

    public function adminDestroy(Request $request, int $id): JsonResponse
    {
        $this->authorizeAdminRole($request, 'manager', 'owner');

        $promotion = Promotion::findOrFail($id);
        $promotion->delete();

        return response()->json(['message' => 'Promotion deactivated.']);
    }

    public function adminReport(Request $request): JsonResponse
    {
        $report = Promotion::withCount('redemptions')
            ->with(['redemptions' => fn ($q) => $q->selectRaw('promotion_id, SUM(discount_laar) as total_discount_laar, COUNT(*) as count')->groupBy('promotion_id')])
            ->get()
            ->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'code' => $p->code,
                'redemptions_count' => $p->redemptions_count,
                'total_discount_laar' => $p->redemptions->first()?->total_discount_laar ?? 0,
            ]);

        return response()->json(['report' => $report]);
    }
}
