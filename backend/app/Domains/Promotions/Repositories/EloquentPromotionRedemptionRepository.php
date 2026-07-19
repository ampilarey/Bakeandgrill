<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Repositories;

use App\Models\PromotionRedemption;

class EloquentPromotionRedemptionRepository implements PromotionRedemptionRepositoryInterface
{
    public function countByPromotionAndCustomer(int $promotionId, int $customerId): int
    {
        return PromotionRedemption::where('promotion_id', $promotionId)
            ->where('customer_id', $customerId)
            ->where(function ($q) {
                // Pre-migration rows have null status; treat as active.
                $q->where('status', 'active')->orWhereNull('status');
            })
            ->count();
    }
}
