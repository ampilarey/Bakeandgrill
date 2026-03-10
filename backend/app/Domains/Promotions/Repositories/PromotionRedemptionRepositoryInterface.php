<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Repositories;

interface PromotionRedemptionRepositoryInterface
{
    public function countByPromotionAndCustomer(int $promotionId, int $customerId): int;
}
