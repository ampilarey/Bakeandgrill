<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Repositories;

use App\Models\LoyaltyHold;

interface LoyaltyHoldRepositoryInterface
{
    public function findActiveByOrderId(int $orderId): ?LoyaltyHold;

    /**
     * Return all active holds for a customer, optionally excluding one order.
     * Used to release stale holds from abandoned checkouts before creating a new one.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, LoyaltyHold>
     */
    public function findActiveByCustomerId(int $customerId, ?int $excludeOrderId = null): \Illuminate\Database\Eloquent\Collection;

    public function upsertForOrder(int $orderId, array $attributes): LoyaltyHold;

    public function markConsumed(LoyaltyHold $hold): void;

    public function markReleased(LoyaltyHold $hold): void;
}
