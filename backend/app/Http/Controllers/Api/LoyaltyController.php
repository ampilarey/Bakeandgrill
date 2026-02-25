<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Loyalty\Services\LoyaltyLedgerService;
use App\Domains\Loyalty\Services\PointsCalculator;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\LoyaltyAccount;
use App\Models\LoyaltyHold;
use App\Models\LoyaltyLedger;
use App\Models\Order;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LoyaltyController extends Controller
{
    public function __construct(
        private LoyaltyLedgerService $service,
        private PointsCalculator $calculator,
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

        return response()->json([
            'account' => [
                'points_balance' => $account->points_balance,
                'points_held' => $account->points_held,
                'available_points' => $account->availablePoints(),
                'lifetime_points' => $account->lifetime_points,
                'tier' => $account->tier,
            ],
            'rates' => [
                'earn_per_mvr' => $this->calculator->earnRatePerMvr(),
                'discount_per_point_laar' => $this->calculator->discountLaarForPoints(1),
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

        return response()->json(['message' => 'Hold released.']);
    }

    // ─── Admin Endpoints ──────────────────────────────────────────────────────

    public function adminAccountIndex(Request $request): JsonResponse
    {
        $query = LoyaltyAccount::with('customer:id,name,phone')
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
                'id'              => $account->id,
                'customer_id'     => $account->customer_id,
                'customer_name'   => $account->customer?->name,
                'customer_phone'  => $account->customer?->phone ?? '—',
                'points_balance'  => $account->points_balance,
                'points_held'     => $account->points_held,
                'lifetime_points' => $account->lifetime_points,
                'tier'            => $account->tier,
                'updated_at'      => $account->updated_at?->toIso8601String(),
            ];
        });

        return response()->json($accounts);
    }

    public function adminLedger(Request $request, int $customerId): JsonResponse
    {
        $ledger = LoyaltyLedger::where('customer_id', $customerId)
            ->orderByDesc('occurred_at')
            ->paginate(100);

        // Map to frontend-expected shape
        $ledger->getCollection()->transform(fn (LoyaltyLedger $entry) => [
            'id'         => $entry->id,
            'delta'      => $entry->points,
            'reason'     => $entry->notes ?? $entry->type,
            'created_at' => $entry->occurred_at?->toIso8601String() ?? $entry->created_at?->toIso8601String(),
        ]);

        return response()->json($ledger);
    }

    public function adminAdjust(Request $request, int $customerId): JsonResponse
    {
        $request->validate([
            'delta'  => 'required|integer|not_in:0',
            'reason' => 'required|string|max:255',
        ]);

        $customer = Customer::findOrFail($customerId);
        $account  = $this->service->accountFor($customer);
        $delta    = $request->integer('delta');

        \Illuminate\Support\Facades\DB::transaction(function () use ($account, $customer, $delta, $request): void {
            $newBalance = max(0, $account->points_balance + $delta);

            LoyaltyLedger::create([
                'customer_id'     => $customer->id,
                'type'            => $delta > 0 ? 'admin_credit' : 'admin_debit',
                'points'          => $delta,
                'balance_after'   => $newBalance,
                'notes'           => $request->input('reason'),
                'idempotency_key' => 'admin-adjust:' . $customer->id . ':' . now()->timestamp,
                'occurred_at'     => now(),
            ]);

            $account->update([
                'points_balance'  => $newBalance,
                'lifetime_points' => $delta > 0
                    ? $account->lifetime_points + $delta
                    : $account->lifetime_points,
            ]);
        });

        return response()->json([
            'message'     => 'Points adjusted.',
            'new_balance' => $account->fresh()?->points_balance,
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
