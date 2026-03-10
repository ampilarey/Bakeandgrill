<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Repositories;

use App\Models\Promotion;

interface PromotionRepositoryInterface
{
    public function findByCode(string $code): ?Promotion;

    /** @param string[] $relations */
    public function findByCodeWithRelations(string $code, array $relations): ?Promotion;

    public function findById(int $id): ?Promotion;

    public function incrementRedemptionsCount(int $promotionId): void;
}
