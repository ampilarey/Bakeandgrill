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
     * Cart reward picker — which free rewards the current basket has earned.
     * Public; entitlement is recomputed from the submitted lines (not trusted client state).
     */
    public function cartRewards(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'items' => 'required|array|min:1|max:50',
            'items.*.item_id' => 'required|integer|min:1',
            'items.*.quantity' => 'required|integer|min:1|max:99',
            'items.*.unit_price' => 'nullable|numeric|min:0',
        ]);

        $user = $request->user();
        $customerId = ($user && $user->tokenCan('customer')) ? (int) $user->id : null;

        $lines = [];
        foreach ($validated['items'] as $row) {
            $lines[] = [
                'item_id' => (int) $row['item_id'],
                'quantity' => (int) $row['quantity'],
                'unit_price' => (float) ($row['unit_price'] ?? 0),
            ];
        }

        // Fill missing prices from catalog so free_item math / display is honest.
        $itemIds = array_column($lines, 'item_id');
        $prices = \App\Models\Item::query()->whereIn('id', $itemIds)->pluck('base_price', 'id');
        foreach ($lines as &$line) {
            if ($line['unit_price'] <= 0) {
                $line['unit_price'] = (float) ($prices[$line['item_id']] ?? 0);
            }
            $line['total_price'] = $line['unit_price'] * $line['quantity'];
        }
        unset($line);

        return response()->json([
            'rewards' => $this->evaluator->earnedRewardChoices($lines, $customerId),
        ]);
    }

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
        $isStaffActor = $user instanceof \App\Models\User && $user->tokenCan('staff');

        if ($order && !$user) {
            return response()->json([
                'valid' => false,
                'message' => 'Sign in to validate a promo against an order.',
            ], 401);
        }

        // Prevent cross-order IDOR: customers may only validate against their own orders
        if ($order && $isCustomerActor) {
            if ((int) $order->customer_id !== (int) $user->id) {
                return response()->json(['valid' => false, 'message' => 'Order not found.'], 404);
            }
        }

        if ($order && !$isCustomerActor && !$isStaffActor) {
            return response()->json([
                'valid' => false,
                'message' => 'Sign in to validate a promo against an order.',
            ], 401);
        }

        // Resolve the customer ID for per-customer usage evaluation:
        // - For customer actors: their own ID
        // - For staff actors with an order: the order owner's customer_id
        // - Otherwise null (unauthenticated / no order context)
        $customerId = $isCustomerActor
            ? $user->id
            : ($order?->customer_id ?? null);

        if (!$order) {
            $promo = Promotion::where('code', strtoupper(trim($request->input('code'))))->first();
            if (!$promo || !$promo->isValid()) {
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
        if (!$user) {
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
            if (!$user->hasPermission('promotions.discounts')) {
                return response()->json(['message' => 'You do not have permission to apply discounts.'], 403);
            }
        }

        // Block apply once payment has started — lowering the total would make
        // total < amount paid. Staff must handle adjustments manually.
        if ($this->promoNotModifiable($order)) {
            return response()->json(['message' => 'Cannot apply promo to this order.'], 422);
        }

        // Resolve customer ID for per-customer usage limit evaluation.
        $customerId = $isCustomerActor ? $user->id : $order->customer_id;

        $result = $this->evaluator->evaluate($request->input('code'), $order, $customerId);

        if (!$result['valid']) {
            return response()->json(['message' => $result['message']], 422);
        }

        $promotion = $result['promotion'];
        $idempotencyKey = 'order-promo:' . $orderId . ':' . $promotion->id;

        // Track whether the promo was actually persisted so we can return the
        // correct status if the order was concurrently locked into a terminal state.
        $applied = false;
        $rejectMessage = null;

        DB::transaction(function () use ($order, $orderId, $promotion, $result, $idempotencyKey, &$applied, &$rejectMessage): void {
            // Re-lock the order row inside the transaction to prevent race conditions.
            $order = Order::lockForUpdate()->findOrFail($orderId);

            if ($this->promoNotModifiable($order)) {
                // Order transitioned to a terminal/partial state between the pre-check and the lock.
                // $applied stays false; caller will receive a 409.
                return;
            }

            // Lock the promotion and enforce campaign-wide max_uses under concurrency
            // (confirmed redemptions + pending drafts on other open orders).
            $lockedPromo = Promotion::query()->where('id', $promotion->id)->lockForUpdate()->firstOrFail();
            if ($lockedPromo->max_uses
                && PromotionEvaluator::campaignUsageIncludingPending($lockedPromo, $order->id) >= (int) $lockedPromo->max_uses
            ) {
                $rejectMessage = 'Promo code is not valid or has expired.';

                return;
            }

            $existing = OrderPromotion::where('order_id', $order->id)
                ->whereNotIn('status', ['released'])
                ->first();

            if ($existing && !$promotion->stackable) {
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

        if ($rejectMessage !== null) {
            return response()->json(['message' => $rejectMessage], 422);
        }

        if (!$applied) {
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
            if (!$user->hasPermission('promotions.discounts')) {
                return response()->json(['message' => 'You do not have permission to apply discounts.'], 403);
            }
        }

        if ($this->promoNotModifiable($order)) {
            return response()->json(['message' => 'Cannot modify promo on this order.'], 422);
        }

        // Mirror applyToOrder: lock the row inside the transaction so a concurrent
        // payment cannot mark the order paid between the pre-check and the UPDATE.
        $removed = false;

        DB::transaction(function () use ($orderId, $promotionId, &$removed): void {
            $order = Order::lockForUpdate()->findOrFail($orderId);

            // Re-check terminal/partial state under the lock.
            if ($this->promoNotModifiable($order)) {
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

        if (!$removed) {
            return response()->json(['message' => 'Order is no longer modifiable.'], 409);
        }

        return response()->json(['message' => 'Promo removed.']);
    }

    /**
     * POS cart preview — evaluates a promo against cart lines (or an existing
     * order) without persisting. Clients must never trust the returned amount
     * as a charge authority; apply still recomputes server-side.
     */
    public function posPreview(Request $request): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }
        if (!$request->user()->hasPermission('promotions.discounts')) {
            return response()->json(['message' => 'You do not have permission to apply discounts.'], 403);
        }

        $request->validate([
            'code' => 'required|string|max:50',
            'order_id' => 'nullable|integer|exists:orders,id',
            'customer_id' => 'nullable|integer|exists:customers,id',
            'items' => 'nullable|array|min:1',
            'items.*.item_id' => 'required_with:items|integer|exists:items,id',
            'items.*.quantity' => 'nullable|integer|min:1',
            'items.*.unit_price' => 'required_with:items|numeric|min:0',
            'items.*.total_price' => 'nullable|numeric|min:0',
        ]);

        if ($request->filled('order_id')) {
            $order = Order::with('items.item')->findOrFail($request->integer('order_id'));
            $result = $this->evaluator->evaluate(
                $request->input('code'),
                $order,
                $request->integer('customer_id') ?: $order->customer_id,
            );
        } else {
            $items = $request->input('items', []);
            if (!is_array($items) || $items === []) {
                return response()->json([
                    'valid' => false,
                    'message' => 'Provide order_id or cart items.',
                    'discount_laar' => 0,
                ]);
            }

            $result = $this->evaluator->evaluateForCart(
                $request->input('code'),
                $items,
                $request->filled('customer_id') ? $request->integer('customer_id') : null,
            );
        }

        return response()->json([
            'valid' => $result['valid'],
            'message' => $result['message'],
            'discount_laar' => $result['discount_laar'],
            'discount_mvr' => number_format($result['discount_laar'] / 100, 2),
            'promotion' => $result['promotion']
                ? $result['promotion']->only('id', 'name', 'type', 'discount_value', 'scope')
                : null,
        ]);
    }

    // ─── Admin Endpoints ─────────────────────────────────────────────────────

    public function adminIndex(Request $request): JsonResponse
    {
        // Discount cards live under /admin/discount-cards — keep campaign promos clean.
        $promotions = Promotion::withTrashed()
            ->with('targets')
            ->where(function ($q): void {
                $q->whereNull('metadata->kind')
                    ->orWhere('metadata->kind', '!=', 'discount_card');
            })
            ->orderByDesc('created_at')
            ->paginate(50);

        return response()->json($promotions);
    }

    /**
     * Promo apply/remove is blocked once kitchen/payment status means money
     * has been collected (or the ticket is otherwise terminal).
     */
    private function promoNotModifiable(Order $order): bool
    {
        if (in_array($order->status, ['paid', 'completed', 'cancelled', 'partial'], true)) {
            return true;
        }

        return in_array((string) ($order->payment_status ?? ''), ['partial', 'partially_paid', 'paid'], true);
    }

    // ─── Internal authorization guard (defense-in-depth) ─────────────────────
    private function authorizeAdminRole(Request $request, string ...$roles): void
    {
        $user = $request->user();
        if (!$user || $user instanceof Customer) {
            abort(403, 'Forbidden.');
        }
        $user->loadMissing('role');
        if (!in_array($user->role?->slug, $roles, true)) {
            abort(403, 'Insufficient role.');
        }
    }

    public function adminStore(Request $request): JsonResponse
    {
        $this->authorizeAdminRole($request, 'manager', 'owner');

        $autoApply = $request->boolean('auto_apply');

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'code' => ($autoApply ? 'nullable' : 'required') . '|string|max:50|unique:promotions,code',
            'type' => 'required|in:percentage,fixed,free_item,tiered,quantity_break,buy_x_get_y,free_delivery',
            'discount_value' => 'nullable|integer|min:0',
            'is_active' => 'boolean',
            'auto_apply' => 'boolean',
            'first_order_only' => 'boolean',
            'registered_only' => 'boolean',
            'waive_delivery' => 'boolean',
            'budget_laar' => 'nullable|integer|min:1',
            'metadata' => 'nullable|array',
            'metadata.tiers' => 'nullable|array',
            'metadata.tiers.*.min_laar' => 'required_with:metadata.tiers|integer|min:0',
            'metadata.tiers.*.kind' => 'required_with:metadata.tiers|in:fixed,percentage',
            'metadata.tiers.*.value' => 'required_with:metadata.tiers|integer|min:0',
            'metadata.min_qty' => 'nullable|integer|min:1',
            'metadata.kind' => 'nullable|in:fixed,percentage',
            'metadata.value' => 'nullable|integer|min:0',
            'metadata.buy_qty' => 'nullable|integer|min:1',
            'metadata.get_qty' => 'nullable|integer|min:1',
            'metadata.get_discount_pct' => 'nullable|integer|min:0|max:100',
            'metadata.cheapest' => 'nullable|boolean',
            'starts_at' => 'nullable|date',
            'expires_at' => 'nullable|date|after:starts_at',
            'days_of_week' => 'nullable|array',
            'days_of_week.*' => 'integer|min:0|max:6',
            'starts_time' => 'nullable|date_format:H:i,H:i:s',
            'ends_time' => 'nullable|date_format:H:i,H:i:s',
            'max_uses' => 'nullable|integer|min:1',
            'max_uses_per_customer' => 'nullable|integer|min:1',
            'stackable' => 'boolean',
            'min_order_laar' => 'nullable|integer|min:0',
            'scope' => 'in:order,item',
            'restricted_customer_id' => 'nullable|integer|exists:customers,id',
            'targets' => 'nullable|array',
            'targets.*.target_type' => 'required_with:targets|in:item,category',
            'targets.*.target_id' => 'required_with:targets|integer|min:1',
            'targets.*.is_exclusion' => 'boolean',
            'targets.*.role' => 'nullable|in:trigger,reward',
            'targets.*.metadata' => 'nullable|array',
            'targets.*.metadata.min_qty' => 'nullable|integer|min:1',
        ]);

        $validated['discount_value'] = (int) ($validated['discount_value'] ?? 0);
        if (($validated['type'] ?? '') === 'free_delivery') {
            $validated['waive_delivery'] = true;
        }

        if ($autoApply) {
            $validated['auto_apply'] = true;
            $validated['restricted_customer_id'] = null;
            $validated['code'] = $validated['code'] ?? null;
        } else {
            $validated['auto_apply'] = false;
        }

        // Fixed promos are stored in laari — hard cap MVR 5000.
        if (($validated['type'] ?? '') === 'fixed' && (int) $validated['discount_value'] > 500000) {
            return response()->json([
                'message' => 'Fixed discount cannot exceed MVR 5000.',
                'errors' => ['discount_value' => ['Fixed discount cannot exceed MVR 5000.']],
            ], 422);
        }

        $targets = $validated['targets'] ?? [];
        unset($validated['targets']);

        $promotion = Promotion::create($validated);

        foreach ($targets as $target) {
            $promotion->targets()->create([
                'target_type' => $target['target_type'],
                'target_id' => (int) $target['target_id'],
                'is_exclusion' => (bool) ($target['is_exclusion'] ?? false),
                // null role = reward by construction (legacy).
                'role' => $target['role'] ?? null,
                'metadata' => $target['metadata'] ?? null,
            ]);
        }

        $promotion->load('targets');

        return response()->json(['promotion' => $promotion], 201);
    }

    public function adminUpdate(Request $request, int $id): JsonResponse
    {
        $this->authorizeAdminRole($request, 'manager', 'owner');

        $promotion = Promotion::withTrashed()->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'type' => 'sometimes|in:percentage,fixed,free_item,tiered,quantity_break,buy_x_get_y,free_delivery',
            'discount_value' => 'sometimes|integer|min:0',
            'is_active' => 'sometimes|boolean',
            'auto_apply' => 'sometimes|boolean',
            'first_order_only' => 'sometimes|boolean',
            'registered_only' => 'sometimes|boolean',
            'waive_delivery' => 'sometimes|boolean',
            'budget_laar' => 'nullable|integer|min:1',
            'metadata' => 'nullable|array',
            'metadata.tiers' => 'nullable|array',
            'metadata.tiers.*.min_laar' => 'required_with:metadata.tiers|integer|min:0',
            'metadata.tiers.*.kind' => 'required_with:metadata.tiers|in:fixed,percentage',
            'metadata.tiers.*.value' => 'required_with:metadata.tiers|integer|min:0',
            'metadata.min_qty' => 'nullable|integer|min:1',
            'metadata.kind' => 'nullable|in:fixed,percentage',
            'metadata.value' => 'nullable|integer|min:0',
            'metadata.buy_qty' => 'nullable|integer|min:1',
            'metadata.get_qty' => 'nullable|integer|min:1',
            'metadata.get_discount_pct' => 'nullable|integer|min:0|max:100',
            'metadata.cheapest' => 'nullable|boolean',
            'expires_at' => 'nullable|date',
            'days_of_week' => 'nullable|array',
            'days_of_week.*' => 'integer|min:0|max:6',
            'starts_time' => 'nullable|date_format:H:i,H:i:s',
            'ends_time' => 'nullable|date_format:H:i,H:i:s',
            'max_uses' => 'nullable|integer|min:1',
            'max_uses_per_customer' => 'nullable|integer|min:1',
            'min_order_laar' => 'nullable|integer|min:0',
            'stackable' => 'sometimes|boolean',
            'scope' => 'sometimes|in:order,item',
            'restricted_customer_id' => 'nullable|integer|exists:customers,id',
            'targets' => 'nullable|array',
            'targets.*.target_type' => 'required_with:targets|in:item,category',
            'targets.*.target_id' => 'required_with:targets|integer|min:1',
            'targets.*.is_exclusion' => 'boolean',
            'targets.*.role' => 'nullable|in:trigger,reward',
            'targets.*.metadata' => 'nullable|array',
            'targets.*.metadata.min_qty' => 'nullable|integer|min:1',
        ]);

        if (($validated['type'] ?? $promotion->type) === 'free_delivery') {
            $validated['waive_delivery'] = true;
        }

        if (array_key_exists('auto_apply', $validated) && $validated['auto_apply']) {
            $validated['restricted_customer_id'] = null;
            if ($promotion->code && !str_starts_with((string) $promotion->code, 'AUTO-')) {
                // Keep existing code for display; auto mode does not require it.
            }
        }

        $targets = $validated['targets'] ?? null;
        unset($validated['targets']);

        $promotion->update($validated);

        if (is_array($targets)) {
            $promotion->targets()->delete();
            foreach ($targets as $target) {
                $promotion->targets()->create([
                    'target_type' => $target['target_type'],
                    'target_id' => (int) $target['target_id'],
                    'is_exclusion' => (bool) ($target['is_exclusion'] ?? false),
                    'role' => $target['role'] ?? null,
                    'metadata' => $target['metadata'] ?? null,
                ]);
            }
        }

        $promotion->load('targets');

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
                'auto_apply' => (bool) $p->auto_apply,
                'is_active' => (bool) $p->is_active,
                'type' => $p->type,
                'discount_value' => $p->discount_value,
                'redemptions_count' => $p->redemptions_count,
                'total_discount_laar' => $p->redemptions->first()?->total_discount_laar ?? 0,
                'order_promotions_draft' => OrderPromotion::where('promotion_id', $p->id)->where('status', 'draft')->count(),
            ]);

        $specials = \App\Models\DailySpecial::query()
            ->with('item:id,name')
            ->orderByDesc('id')
            ->limit(50)
            ->get()
            ->map(fn ($s) => [
                'id' => $s->id,
                'kind' => 'special',
                'name' => $s->item?->name ?? ('Special #' . $s->id),
                'is_active' => (bool) $s->is_active,
                'sold_count' => (int) ($s->sold_count ?? 0),
                'max_quantity' => $s->max_quantity,
                'discount_pct' => $s->discount_pct,
                'special_price' => $s->special_price,
                'start_date' => $s->start_date?->toDateString(),
                'end_date' => $s->end_date?->toDateString(),
            ]);

        return response()->json([
            'report' => $report,
            'specials' => $specials,
            'offers_preview' => app(\App\Domains\Promotions\Services\OffersService::class)->activeOffers(),
        ]);
    }
}
