<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Services;

use App\Domains\Loyalty\Repositories\LoyaltyAccountRepositoryInterface;
use App\Domains\Loyalty\Repositories\LoyaltyHoldRepositoryInterface;
use App\Domains\Loyalty\Repositories\LoyaltyLedgerRepositoryInterface;
use App\Models\Customer;
use App\Models\LoyaltyAccount;
use App\Models\LoyaltyHold;
use App\Models\Order;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Central service for all loyalty account operations.
 * All mutations are transactional and idempotent.
 *
 * Database access is fully delegated to injected repositories —
 * this service contains only business logic and transaction boundaries.
 */
class LoyaltyLedgerService
{
    public function __construct(
        private PointsCalculator                 $calculator,
        private LoyaltyAccountRepositoryInterface $accountRepo,
        private LoyaltyHoldRepositoryInterface    $holdRepo,
        private LoyaltyLedgerRepositoryInterface  $ledgerRepo,
    ) {}

    /**
     * Get or create a loyalty account for a customer.
     */
    public function accountFor(Customer $customer): LoyaltyAccount
    {
        return $this->accountRepo->getOrCreateAccount($customer->id);
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

            $existing = $this->holdRepo->findActiveByOrderId($order->id);
            if ($existing) {
                $this->releaseHold($existing, $account);
            }

            $idempotencyKey = 'hold:' . $customer->id . ':' . $order->id . ':' . $pointsToRedeem;
            $ttlMinutes = (int) config('app.loyalty_hold_ttl', 30);

            $hold = $this->holdRepo->upsertForOrder($order->id, [
                'idempotency_key' => $idempotencyKey,
                'customer_id'     => $customer->id,
                'points_held'     => $pointsToRedeem,
                'discount_laar'   => $discountLaar,
                'status'          => 'active',
                'expires_at'      => now()->addMinutes($ttlMinutes),
                'consumed_at'     => null,
                'released_at'     => null,
            ]);

            $this->accountRepo->incrementPointsHeld($customer->id, $pointsToRedeem);

            Log::info('Loyalty hold created', [
                'customer_id'  => $customer->id,
                'order_id'     => $order->id,
                'points_held'  => $pointsToRedeem,
                'discount_laar'=> $discountLaar,
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
                'hold_id'    => $hold->id,
                'expired_at' => $hold->expires_at,
            ]);
        }

        DB::transaction(function () use ($hold): void {
            $account = $this->accountRepo->lockAccount($hold->customer_id);
            if (!$account) {
                Log::error('Loyalty account not found for hold consumption', ['hold_id' => $hold->id]);

                return;
            }

            if ($account->points_balance < $hold->points_held) {
                Log::warning('Insufficient points balance at hold consumption time', [
                    'hold_id' => $hold->id,
                    'balance' => $account->points_balance,
                    'needed'  => $hold->points_held,
                ]);
                // Never fail a confirmed payment over a discount — use what we can
                $pointsToConsume = $account->points_balance;
            } else {
                $pointsToConsume = $hold->points_held;
            }

            $idempotencyKey = 'loyalty:redeem:' . $hold->order_id . ':' . $hold->id;
            $balanceAfter   = max(0, $account->points_balance - $pointsToConsume);

            $this->ledgerRepo->firstOrCreateByIdempotencyKey($idempotencyKey, [
                'customer_id'     => $hold->customer_id,
                'order_id'        => $hold->order_id,
                'type'            => 'redeem',
                'points'          => -$pointsToConsume,
                'balance_after'   => $balanceAfter,
                'notes'           => 'Redeemed for order',
                'occurred_at'     => now(),
            ]);

            $this->accountRepo->updateBalance($hold->customer_id, $balanceAfter);
            $this->accountRepo->decrementPointsHeld($hold->customer_id, (int) $hold->points_held);

            $this->holdRepo->markConsumed($hold);
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
            $this->holdRepo->markReleased($hold);
            $this->accountRepo->decrementPointsHeld($hold->customer_id, (int) $hold->points_held);
        });
    }

    /**
     * Award points for a completed order.
     */
    public function earnPointsForOrder(Customer $customer, Order $order): void
    {
        $account = $this->accountFor($customer);
        $points  = $this->calculator->pointsForOrder($order, $account);

        if ($points <= 0) {
            return;
        }

        $idempotencyKey = 'loyalty:earn:' . $order->id . ':' . $customer->id;

        DB::transaction(function () use ($customer, $order, $points, $idempotencyKey, $account): void {
            if ($this->ledgerRepo->existsByIdempotencyKey($idempotencyKey)) {
                Log::info('Loyalty earn already recorded, skipping', ['key' => $idempotencyKey]);

                return;
            }

            $balanceAfter = $account->points_balance + $points;

            $this->ledgerRepo->createEntry([
                'idempotency_key' => $idempotencyKey,
                'customer_id'     => $customer->id,
                'order_id'        => $order->id,
                'type'            => 'earn',
                'points'          => $points,
                'balance_after'   => $balanceAfter,
                'notes'           => 'Earned from order ' . $order->order_number,
                'occurred_at'     => now(),
            ]);

            $this->accountRepo->updateBalance($customer->id, $balanceAfter, $points);
        });
    }
}
