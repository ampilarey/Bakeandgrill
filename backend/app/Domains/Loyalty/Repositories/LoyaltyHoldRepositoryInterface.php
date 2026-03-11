<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Repositories;

use App\Models\LoyaltyHold;

interface LoyaltyHoldRepositoryInterface
{
    public function findActiveByOrderId(int $orderId): ?LoyaltyHold;

    public function upsertForOrder(int $orderId, array $attributes): LoyaltyHold;

    public function markConsumed(LoyaltyHold $hold): void;

    public function markReleased(LoyaltyHold $hold): void;
}
