<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Promotions\Services\PromotionEvaluator;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderPromotion;
use App\Models\Promotion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PromotionController extends Controller
{
    public function __construct(private PromotionEvaluator $evaluator) {}

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
        $order = $orderId ? Order::findOrFail($orderId) : null;
        $customerId = $request->user()?->id;

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
     */
    public function applyToOrder(Request $request, int $orderId): JsonResponse
    {
        $request->validate(['code' => 'required|string|max:50']);

        $order = Order::findOrFail($orderId);
        $customerId = $request->user()?->id;

        if (in_array($order->status, ['paid', 'completed', 'cancelled'], true)) {
            return response()->json(['message' => 'Cannot apply promo to this order.'], 422);
        }

        $result = $this->evaluator->evaluate($request->input('code'), $order, $customerId);

        if (!$result['valid']) {
            return response()->json(['message' => $result['message']], 422);
        }

        $promotion = $result['promotion'];
        $idempotencyKey = 'order-promo:' . $orderId . ':' . $promotion->id;

        DB::transaction(function () use ($order, $promotion, $result, $idempotencyKey): void {
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

            $order->update([
                'promo_discount_laar' => $totalPromoDiscount,
                'discount_amount' => round(($order->manual_discount_laar + $totalPromoDiscount) / 100, 2),
                'total' => max(0, round(($order->subtotal_laar ?? (int) round($order->subtotal * 100) - $totalPromoDiscount - ($order->loyalty_discount_laar ?? 0) - ($order->manual_discount_laar ?? 0) + ($order->tax_laar ?? (int) round($order->tax_amount * 100))) / 100, 2)),
            ]);
        });

        return response()->json([
            'message' => $result['message'],
            'discount_laar' => $result['discount_laar'],
            'discount_mvr' => number_format($result['discount_laar'] / 100, 2),
        ]);
    }

    /**
     * Remove a promo from an order.
     */
    public function removeFromOrder(Request $request, int $orderId, int $promotionId): JsonResponse
    {
        $order = Order::findOrFail($orderId);

        if (in_array($order->status, ['paid', 'completed'], true)) {
            return response()->json(['message' => 'Cannot modify promo on a paid order.'], 422);
        }

        DB::transaction(function () use ($order, $promotionId): void {
            OrderPromotion::where('order_id', $order->id)
                ->where('promotion_id', $promotionId)
                ->where('status', 'draft')
                ->update(['status' => 'released']);

            $totalPromoDiscount = OrderPromotion::where('order_id', $order->id)
                ->where('status', 'draft')
                ->sum('discount_laar');

            $order->update(['promo_discount_laar' => $totalPromoDiscount]);
        });

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

    public function adminStore(Request $request): JsonResponse
    {
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
        ]);

        $promotion = Promotion::create($validated);

        return response()->json(['promotion' => $promotion], 201);
    }

    public function adminUpdate(Request $request, int $id): JsonResponse
    {
        $promotion = Promotion::withTrashed()->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'is_active' => 'sometimes|boolean',
            'expires_at' => 'nullable|date',
            'max_uses' => 'nullable|integer|min:1',
            'max_uses_per_customer' => 'nullable|integer|min:1',
        ]);

        $promotion->update($validated);

        return response()->json(['promotion' => $promotion]);
    }

    public function adminDestroy(int $id): JsonResponse
    {
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
