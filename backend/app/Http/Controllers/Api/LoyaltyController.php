<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Loyalty\Services\PointsCalculator;
use App\Domains\Orders\Services\OrderTotalsCalculator;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\LoyaltyAccount;
use App\Models\LoyaltyHold;
use App\Models\LoyaltyLedger;
use App\Models\Order;
use App\Services\LoyaltySettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class LoyaltyController extends Controller
{
    public function __construct(
        private LoyaltyLedgerService $service,
        private PointsCalculator $calculator,
        private LoyaltySettingsService $settings,
    ) {}

    /**
     * Get the authenticated customer's loyalty account.
     */
    public function me(Request $request): JsonResponse
    {
        $customer = $request->user();
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $account = $this->service->accountFor($customer);

        $tierProgress = $this->settings->tierProgress(
            (int) $account->lifetime_points,
            (string) $account->tier,
        );

        return response()->json([
            'account' => [
                'points_balance' => $account->points_balance,
                'points_held' => $account->points_held,
                'available_points' => $account->availablePoints(),
                'lifetime_points' => $account->lifetime_points,
                'tier' => $account->tier,
            ],
            'tier_progress' => $tierProgress,
            'program' => $this->settings->publicRates(),
            'rates' => [
                'earn_per_mvr' => $this->calculator->earnRatePerMvr(),
                'redeem_rate_points_per_mvr' => $this->settings->redeemRatePointsPerMvr(),
                'discount_per_point_laar' => $this->calculator->discountLaarForPoints(1),
                'min_redeem_points' => $this->calculator->minRedeemPoints(),
                'max_redeem_points' => $this->calculator->maxRedeemPoints(),
                'max_redeem_percent' => $this->calculator->maxRedeemPercent(),
            ],
        ]);
    }

    /**
     * Preview how much discount X points would give without committing.
     */
    public function holdPreview(Request $request): JsonResponse
    {
        $request->validate([
            'points' => 'required|integer|min:1',
            'order_id' => 'required|integer|exists:orders,id',
        ]);

        $customer = $request->user();
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // IDOR guard: ensure the order belongs to this customer.
        $order = Order::find($request->integer('order_id'));
        if (!$order || (int) $order->customer_id !== (int) $customer->id) {
            return response()->json(['message' => 'Order not found.'], 404);
        }

        $account = $this->service->accountFor($customer);
        $points = min($request->integer('points'), $account->availablePoints());
        $discountLaar = $this->calculator->discountLaarForPoints($points);

        return response()->json([
            'points' => $points,
            'discount_laar' => $discountLaar,
            'discount_mvr' => number_format($discountLaar / 100, 2),
            'available_points' => $account->availablePoints(),
        ]);
    }

    /**
     * Create or refresh a loyalty hold for an order.
     */
    public function hold(Request $request): JsonResponse
    {
        $request->validate([
            'order_id' => 'required|integer|exists:orders,id',
            'points' => 'required|integer|min:1',
        ]);

        $customer = $request->user();
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $order = Order::findOrFail($request->integer('order_id'));

        if ($order->customer_id !== $customer->id) {
            return response()->json(['message' => 'Not your order.'], 403);
        }

        $hold = $this->service->createOrRefreshHold(
            $customer,
            $order,
            $request->integer('points'),
        );

        // Reflect the hold discount in the order so recalculation uses it.
        $order->update(['loyalty_discount_laar' => $hold->discount_laar]);
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh());

        return response()->json([
            'hold' => [
                'points_held' => $hold->points_held,
                'discount_laar' => $hold->discount_laar,
                'discount_mvr' => number_format($hold->discount_laar / 100, 2),
                'expires_at' => $hold->expires_at->toIso8601String(),
            ],
        ], 201);
    }

    /**
     * Release the loyalty hold for an order.
     */
    public function releaseHold(Request $request, int $orderId): JsonResponse
    {
        $customer = $request->user();
        if (!$customer instanceof Customer) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $hold = LoyaltyHold::where('order_id', $orderId)
            ->where('customer_id', $customer->id)
            ->where('status', 'active')
            ->first();

        if (!$hold) {
            return response()->json(['message' => 'No active hold found.'], 404);
        }

        $this->service->releaseHold($hold);

        // Reset the loyalty discount on the order and recalculate totals.
        $order = Order::find($orderId);
        if ($order) {
            $order->update(['loyalty_discount_laar' => 0]);
            app(OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh());
        }

        return response()->json(['message' => 'Hold released.']);
    }

    // ─── Staff POS Endpoints ──────────────────────────────────────────────────
    //
    // The customer-facing `hold` / `releaseHold` / `holdPreview` above are
    // hard-locked to a Customer auth token because they trust the actor IS
    // the customer. Cashiers on the POS register need to redeem points on
    // behalf of a customer they've attached to the ticket — different auth
    // path, same underlying ledger service. We keep the customer routes
    // untouched (zero risk to the online ordering app) and add explicit
    // POS-only twins that:
    //   1. require a staff Sanctum token with the `loyalty.redeem`
    //      permission so a cashier can't quietly drain a customer's points
    //   2. resolve the customer FROM `orders.customer_id`, not from the
    //      authenticated user (the cashier is the actor, the customer is
    //      the subject)
    //   3. share the same LoyaltyLedgerService underneath so accrual,
    //      caps, ledger entries, and tier logic stay consistent across
    //      the two flows

    public function posHoldPreview(Request $request): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }
        if (!$request->user()->hasPermission('loyalty.redeem')) {
            return response()->json(['message' => 'You do not have permission to redeem loyalty points.'], 403);
        }

        $request->validate([
            'points' => 'required|integer|min:1',
            'order_id' => 'required|integer|exists:orders,id',
        ]);

        $order = Order::find($request->integer('order_id'));
        if (!$order) {
            return response()->json(['message' => 'Order not found.'], 404);
        }
        if (!$order->customer_id) {
            return response()->json(['message' => 'Attach a customer to the ticket before redeeming points.'], 422);
        }

        /** @var Customer $customer */
        $customer = Customer::findOrFail($order->customer_id);
        $account = $this->service->accountFor($customer);
        $points = min($request->integer('points'), $account->availablePoints());
        $discountLaar = $this->calculator->discountLaarForPoints($points);

        return response()->json([
            'points' => $points,
            'discount_laar' => $discountLaar,
            'discount_mvr' => number_format($discountLaar / 100, 2),
            'available_points' => $account->availablePoints(),
        ]);
    }

    public function posHold(Request $request): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }
        if (!$request->user()->hasPermission('loyalty.redeem')) {
            return response()->json(['message' => 'You do not have permission to redeem loyalty points.'], 403);
        }

        $request->validate([
            'order_id' => 'required|integer|exists:orders,id',
            'points' => 'required|integer|min:1',
        ]);

        $order = Order::findOrFail($request->integer('order_id'));
        if (!$order->customer_id) {
            return response()->json(['message' => 'Attach a customer to the ticket before redeeming points.'], 422);
        }

        /** @var Customer $customer */
        $customer = Customer::findOrFail($order->customer_id);

        $hold = $this->service->createOrRefreshHold(
            $customer,
            $order,
            $request->integer('points'),
        );

        $order->update(['loyalty_discount_laar' => $hold->discount_laar]);
        $order = app(OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh());

        return response()->json([
            'hold' => [
                'points_held' => $hold->points_held,
                'discount_laar' => $hold->discount_laar,
                'discount_mvr' => number_format($hold->discount_laar / 100, 2),
                'expires_at' => $hold->expires_at->toIso8601String(),
            ],
            'order' => [
                'id' => (int) $order->id,
                'total' => (float) $order->total,
                'subtotal' => (float) $order->subtotal,
                'tax_amount' => (float) $order->tax_amount,
                'loyalty_discount_laar' => (int) $order->loyalty_discount_laar,
            ],
        ], 201);
    }

    public function posReleaseHold(Request $request, int $orderId): JsonResponse
    {
        if (!$request->user()?->tokenCan('staff')) {
            return response()->json(['message' => 'Forbidden - staff access only'], 403);
        }
        if (!$request->user()->hasPermission('loyalty.redeem')) {
            return response()->json(['message' => 'You do not have permission to redeem loyalty points.'], 403);
        }

        $order = Order::find($orderId);
        if (!$order || !$order->customer_id) {
            return response()->json(['message' => 'No customer attached or order not found.'], 404);
        }

        $hold = LoyaltyHold::where('order_id', $orderId)
            ->where('customer_id', $order->customer_id)
            ->where('status', 'active')
            ->first();

        if (!$hold) {
            return response()->json(['message' => 'No active hold found.'], 404);
        }

        $this->service->releaseHold($hold);
        $order->update(['loyalty_discount_laar' => 0]);
        app(OrderTotalsCalculator::class)->recalculateAndPersist($order->fresh());

        return response()->json(['message' => 'Hold released.']);
    }

    // ─── Admin Endpoints ──────────────────────────────────────────────────────

    public function adminSettings(): JsonResponse
    {
        return response()->json([
            'settings' => $this->settings->all(),
            'tiers' => $this->settings->tiers(),
        ]);
    }

    public function adminUpdateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'enabled' => 'sometimes|boolean',
            'earn_rate_per_mvr' => 'sometimes|numeric|min:0',
            'redeem_rate_points_per_mvr' => 'sometimes|integer|min:1',
            'min_redeem_points' => 'sometimes|integer|min:1',
            'max_redeem_points' => 'sometimes|integer|min:1',
            'max_redeem_percent' => 'sometimes|numeric|min:0|max:100',
            'hold_ttl_minutes' => 'sometimes|integer|min:1|max:1440',
            'tiers_enabled' => 'sometimes|boolean',
            'points_expiry_days' => 'sometimes|integer|min:0|max:3650',
            'earn_on_delivery_fee' => 'sometimes|boolean',
            'program_starts_at' => 'nullable|date',
            'program_ends_at' => 'nullable|date|after_or_equal:program_starts_at',
            'customer_message' => 'nullable|string|max:500',
        ]);

        return response()->json([
            'settings' => $this->settings->update($validated),
            'message' => 'Loyalty settings saved.',
        ]);
    }

    public function adminUpdateTiers(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tiers' => 'required|array|min:1',
            'tiers.*.id' => 'required|integer|exists:loyalty_tiers,id',
            'tiers.*.name' => 'required|string|max:50',
            'tiers.*.slug' => 'required|string|max:30',
            'tiers.*.min_lifetime_points' => 'required|integer|min:0',
            'tiers.*.earn_multiplier' => 'required|numeric|min:0|max:10',
            'tiers.*.sort_order' => 'required|integer|min:0',
        ]);

        $tiers = $this->settings->syncTiers($validated['tiers']);

        return response()->json([
            'tiers' => $tiers,
            'message' => 'Tier configuration saved.',
        ]);
    }

    public function adminAccountIndex(Request $request): JsonResponse
    {
        $query = LoyaltyAccount::with('customer:id,name,phone')
            ->whereHas('customer')
            ->orderByDesc('lifetime_points');

        if ($request->filled('search')) {
            $search = '%' . $request->input('search') . '%';
            $query->whereHas('customer', fn ($q) => $q
                ->where('name', 'like', $search)
                ->orWhere('phone', 'like', $search));
        }

        $accounts = $query->paginate(50);

        // Flatten customer fields for frontend
        $accounts->getCollection()->transform(function (LoyaltyAccount $account) {
            return [
                'id' => $account->id,
                'customer_id' => $account->customer_id,
                'customer_name' => $account->customer?->name,
                'customer_phone' => $account->customer?->phone ?? '—',
                'points_balance' => $account->points_balance,
                'points_held' => $account->points_held,
                'lifetime_points' => $account->lifetime_points,
                'tier' => $account->tier,
                'updated_at' => $account->updated_at?->toIso8601String(),
            ];
        });

        return response()->json($accounts);
    }

    public function adminLedger(Request $request, int $customerId): JsonResponse
    {
        $ledger = LoyaltyLedger::with('order:id,order_number')
            ->where('customer_id', $customerId)
            ->orderByDesc('occurred_at')
            ->paginate(100);

        // Map to frontend-expected shape
        $ledger->getCollection()->transform(fn (LoyaltyLedger $entry) => [
            'id' => $entry->id,
            'delta' => $entry->points,
            'reason' => $entry->notes ?? $entry->type,
            'order_id' => $entry->order_id,
            'order_number' => $entry->order?->order_number,
            'created_at' => $entry->occurred_at?->toIso8601String() ?? $entry->created_at?->toIso8601String(),
        ]);

        return response()->json($ledger);
    }

    public function adminAdjust(Request $request, int $customerId): JsonResponse
    {
        $request->validate([
            'delta' => 'required|integer|not_in:0',
            'reason' => 'required|string|max:255',
        ]);

        $customer = Customer::findOrFail($customerId);
        $delta = $request->integer('delta');

        $accountId = \Illuminate\Support\Facades\DB::transaction(function () use ($customer, $delta, $request): int {
            $account = $this->service->accountFor($customer);
            $account = LoyaltyAccount::lockForUpdate()->findOrFail($account->id);
            $newBalance = max(0, $account->points_balance + $delta);

            LoyaltyLedger::create([
                'customer_id' => $customer->id,
                'type' => $delta > 0 ? 'admin_credit' : 'admin_debit',
                'points' => $delta,
                'balance_after' => $newBalance,
                'notes' => $request->input('reason'),
                'idempotency_key' => 'admin-adjust:' . $customer->id . ':' . Str::uuid(),
                'occurred_at' => now(),
                'expires_at' => $delta > 0 ? $this->settings->creditExpiresAt() : null,
                'expiry_processed' => false,
            ]);

            $account->update([
                'points_balance' => $newBalance,
                'lifetime_points' => $delta > 0
                    ? $account->lifetime_points + $delta
                    : $account->lifetime_points,
                'tier' => $this->settings->tierForLifetimePoints(
                    $delta > 0
                        ? $account->lifetime_points + $delta
                        : $account->lifetime_points,
                ),
            ]);

            return $account->id;
        });

        return response()->json([
            'message' => 'Points adjusted.',
            'new_balance' => LoyaltyAccount::find($accountId)?->points_balance,
        ]);
    }

    public function adminReport(Request $request): JsonResponse
    {
        $report = LoyaltyAccount::selectRaw(
            'SUM(points_balance) as total_outstanding_points,
             SUM(lifetime_points) as total_earned_lifetime,
             COUNT(*) as total_accounts,
             SUM(CASE WHEN tier = \'bronze\' THEN 1 ELSE 0 END) as bronze_count,
             SUM(CASE WHEN tier = \'silver\' THEN 1 ELSE 0 END) as silver_count,
             SUM(CASE WHEN tier = \'gold\' THEN 1 ELSE 0 END) as gold_count,
             SUM(CASE WHEN tier = \'platinum\' THEN 1 ELSE 0 END) as platinum_count',
        )->first();

        return response()->json(['report' => $report]);
    }
}
