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
            // Ensure the account row exists before locking it.
            $this->accountFor($customer);
            // Lock the account row to prevent concurrent holds from over-committing
            // the same points balance (C-3: race condition).
            $account = LoyaltyAccount::where('customer_id', $customer->id)->lockForUpdate()->firstOrFail();

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

            $maxDiscountLaar = (int) floor((int) ($order->total_laar ?? round((float) $order->total * 100)) * $this->calculator->maxRedeemPercent() / 100);
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
        DB::transaction(function () use ($hold): void {
            // Lock the hold row FIRST so concurrent calls (e.g. duplicate OrderPaid
            // events) cannot both pass the status check and double-consume.
            $locked = LoyaltyHold::where('id', $hold->id)->lockForUpdate()->first();

            if (!$locked || $locked->status === 'consumed') {
                Log::info('Loyalty hold already consumed or not found, skipping', ['hold_id' => $hold->id]);

                return;
            }

            if ($locked->isExpired() && $locked->status === 'active') {
                Log::warning('Loyalty hold expired but order was paid — honoring redemption', [
                    'hold_id'    => $locked->id,
                    'expired_at' => $locked->expires_at,
                ]);
            }

            $hold = $locked; // Use the locked copy for all subsequent reads
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
     * Credit a one-off bonus (e.g. referral reward) without requiring an Order.
     * Idempotent — safe to call more than once with the same key.
     */
    public function creditBonus(Customer $customer, int $points, string $notes, string $idempotencyKey): void
    {
        if ($points <= 0) {
            return;
        }

        DB::transaction(function () use ($customer, $points, $notes, $idempotencyKey): void {
            $this->accountFor($customer);
            $account = LoyaltyAccount::where('customer_id', $customer->id)->lockForUpdate()->firstOrFail();

            if ($this->ledgerRepo->existsByIdempotencyKey($idempotencyKey)) {
                Log::info('Loyalty bonus already recorded, skipping', ['key' => $idempotencyKey]);

                return;
            }

            $balanceAfter = $account->points_balance + $points;

            $this->ledgerRepo->createEntry([
                'idempotency_key' => $idempotencyKey,
                'customer_id'     => $customer->id,
                'order_id'        => null,
                'type'            => 'bonus',
                'points'          => $points,
                'balance_after'   => $balanceAfter,
                'notes'           => $notes,
                'occurred_at'     => now(),
            ]);

            $this->accountRepo->updateBalance($customer->id, $balanceAfter, $points);
        });
    }

    /**
     * Award points for a completed order.
     */
    public function earnPointsForOrder(Customer $customer, Order $order): void
    {
        $idempotencyKey = 'loyalty:earn:' . $order->id . ':' . $customer->id;

        DB::transaction(function () use ($customer, $order, $idempotencyKey): void {
            // Ensure account exists before acquiring the lock.
            $this->accountFor($customer);
            // Lock the account row so concurrent OrderPaid events (e.g. webhook +
            // return-URL) can't both compute the same balance and corrupt it (C-3).
            $account = LoyaltyAccount::where('customer_id', $customer->id)->lockForUpdate()->firstOrFail();

            $points = $this->calculator->pointsForOrder($order, $account);

            if ($points <= 0) {
                return;
            }

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
