<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Repositories;

use App\Models\LoyaltyHold;

class EloquentLoyaltyHoldRepository implements LoyaltyHoldRepositoryInterface
{
    public function findActiveByOrderId(int $orderId): ?LoyaltyHold
    {
        return LoyaltyHold::where('order_id', $orderId)
            ->whereIn('status', ['active'])
            ->first();
    }

    public function upsertForOrder(int $orderId, array $attributes): LoyaltyHold
    {
        return LoyaltyHold::updateOrCreate(
            ['order_id' => $orderId],
            $attributes,
        );
    }

    public function markConsumed(LoyaltyHold $hold): void
    {
        $hold->update(['status' => 'consumed', 'consumed_at' => now()]);
    }

    public function markReleased(LoyaltyHold $hold): void
    {
        $hold->update(['status' => 'released', 'released_at' => now()]);
    }
}
