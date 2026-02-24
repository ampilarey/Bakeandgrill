<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Services;

use App\Models\Customer;
use App\Models\LoyaltyAccount;
use App\Models\LoyaltyHold;
use App\Models\LoyaltyLedger;
use App\Models\Order;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Central service for all loyalty account operations.
 * All mutations are transactional and idempotent.
 */
class LoyaltyLedgerService
{
    public function __construct(private PointsCalculator $calculator) {}

    /**
     * Get or create a loyalty account for a customer.
     */
    public function accountFor(Customer $customer): LoyaltyAccount
    {
        return LoyaltyAccount::firstOrCreate(
            ['customer_id' => $customer->id],
            ['points_balance' => 0, 'points_held' => 0, 'lifetime_points' => 0, 'tier' => 'bronze'],
        );
    }

    /**
     * Create or refresh a loyalty hold for an order.
     * Upserts: if hold already exists for this order, releases old and creates new.
     */
    public function createOrRefreshHold(Customer $customer, Order $order, int $pointsToRedeem): LoyaltyHold
    {
        return DB::transaction(function () use ($customer, $order, $pointsToRedeem): LoyaltyHold {
            $account = $this->accountFor($customer);

            $minRedeem = $this->calculator->minRedeemPoints();
            if ($pointsToRedeem < $minRedeem) {
                throw new \InvalidArgumentException("Minimum redemption is {$minRedeem} points.");
            }

            $maxRedeem = min(
                $this->calculator->maxRedeemPoints(),
                $account->availablePoints(),
            );

            if ($pointsToRedeem > $maxRedeem) {
                throw new \InvalidArgumentException("You can only redeem up to {$maxRedeem} points.");
            }

            $discountLaar = $this->calculator->discountLaarForPoints($pointsToRedeem);

            $maxDiscountLaar = (int) floor((int) round($order->total * 100) * $this->calculator->maxRedeemPercent() / 100);
            if ($discountLaar > $maxDiscountLaar) {
                $discountLaar = $maxDiscountLaar;
                $pointsToRedeem = $this->calculator->pointsNeededForDiscountLaar($discountLaar);
            }

            $existing = LoyaltyHold::where('order_id', $order->id)
                ->whereIn('status', ['active'])
                ->first();

            if ($existing) {
                $this->releaseHold($existing, $account);
            }

            $idempotencyKey = 'hold:' . $customer->id . ':' . $order->id . ':' . $pointsToRedeem;
            $ttlMinutes = (int) config('app.loyalty_hold_ttl', 30);

            $hold = LoyaltyHold::updateOrCreate(
                ['order_id' => $order->id],
                [
                    'idempotency_key' => $idempotencyKey,
                    'customer_id' => $customer->id,
                    'points_held' => $pointsToRedeem,
                    'discount_laar' => $discountLaar,
                    'status' => 'active',
                    'expires_at' => now()->addMinutes($ttlMinutes),
                    'consumed_at' => null,
                    'released_at' => null,
                ],
            );

            DB::table('loyalty_accounts')
                ->where('customer_id', $customer->id)
                ->increment('points_held', $pointsToRedeem);

            Log::info('Loyalty hold created', [
                'customer_id' => $customer->id,
                'order_id' => $order->id,
                'points_held' => $pointsToRedeem,
                'discount_laar' => $discountLaar,
            ]);

            return $hold;
        });
    }

    /**
     * Consume a hold when order is paid.
     * If hold has expired but customer paid, STILL honor it (log warning).
     */
    public function consumeHold(LoyaltyHold $hold): void
    {
        if ($hold->status === 'consumed') {
            Log::info('Loyalty hold already consumed, skipping', ['hold_id' => $hold->id]);

            return;
        }

        if ($hold->isExpired() && $hold->status === 'active') {
            Log::warning('Loyalty hold expired but order was paid — honoring redemption', [
                'hold_id' => $hold->id,
                'expired_at' => $hold->expires_at,
            ]);
        }

        DB::transaction(function () use ($hold): void {
            $account = LoyaltyAccount::where('customer_id', $hold->customer_id)->lockForUpdate()->first();
            if (!$account) {
                Log::error('Loyalty account not found for hold consumption', ['hold_id' => $hold->id]);

                return;
            }

            if ($account->points_balance < $hold->points_held) {
                Log::warning('Insufficient points balance at hold consumption time', [
                    'hold_id' => $hold->id,
                    'balance' => $account->points_balance,
                    'needed' => $hold->points_held,
                ]);
                // Never fail a confirmed payment over a discount — use what we can
                $pointsToConsume = $account->points_balance;
            } else {
                $pointsToConsume = $hold->points_held;
            }

            $idempotencyKey = 'loyalty:redeem:' . $hold->order_id . ':' . $hold->id;

            $balanceAfter = max(0, $account->points_balance - $pointsToConsume);

            LoyaltyLedger::firstOrCreate(
                ['idempotency_key' => $idempotencyKey],
                [
                    'customer_id' => $hold->customer_id,
                    'order_id' => $hold->order_id,
                    'type' => 'redeem',
                    'points' => -$pointsToConsume,
                    'balance_after' => $balanceAfter,
                    'notes' => 'Redeemed for order',
                    'occurred_at' => now(),
                ],
            );

            DB::table('loyalty_accounts')
                ->where('customer_id', $hold->customer_id)
                ->update([
                    'points_balance' => $balanceAfter,
                    'points_held' => DB::raw("MAX(0, points_held - {$hold->points_held})"),
                ]);

            $hold->update(['status' => 'consumed', 'consumed_at' => now()]);
        });
    }

    /**
     * Release a hold (order cancelled or customer removed loyalty).
     */
    public function releaseHold(LoyaltyHold $hold, ?LoyaltyAccount $account = null): void
    {
        if (!in_array($hold->status, ['active'], true)) {
            return;
        }

        DB::transaction(function () use ($hold): void {
            $hold->update(['status' => 'released', 'released_at' => now()]);

            DB::table('loyalty_accounts')
                ->where('customer_id', $hold->customer_id)
                ->update([
                    'points_held' => DB::raw("MAX(0, points_held - {$hold->points_held})"),
                ]);
        });
    }

    /**
     * Award points for a completed order.
     */
    public function earnPointsForOrder(Customer $customer, Order $order): void
    {
        $account = $this->accountFor($customer);
        $points = $this->calculator->pointsForOrder($order, $account);

        if ($points <= 0) {
            return;
        }

        $idempotencyKey = 'loyalty:earn:' . $order->id . ':' . $customer->id;

        DB::transaction(function () use ($customer, $order, $points, $idempotencyKey, $account): void {
            $existing = LoyaltyLedger::where('idempotency_key', $idempotencyKey)->exists();
            if ($existing) {
                Log::info('Loyalty earn already recorded, skipping', ['key' => $idempotencyKey]);

                return;
            }

            $balanceAfter = $account->points_balance + $points;

            LoyaltyLedger::create([
                'idempotency_key' => $idempotencyKey,
                'customer_id' => $customer->id,
                'order_id' => $order->id,
                'type' => 'earn',
                'points' => $points,
                'balance_after' => $balanceAfter,
                'notes' => 'Earned from order ' . $order->order_number,
                'occurred_at' => now(),
            ]);

            DB::table('loyalty_accounts')
                ->where('customer_id', $customer->id)
                ->update([
                    'points_balance' => $balanceAfter,
                    'lifetime_points' => DB::raw("lifetime_points + {$points}"),
                ]);
        });
    }
}
