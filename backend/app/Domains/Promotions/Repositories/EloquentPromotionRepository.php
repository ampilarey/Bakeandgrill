<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Repositories;

use App\Models\Promotion;
use Illuminate\Support\Facades\DB;

class EloquentPromotionRepository implements PromotionRepositoryInterface
{
    public function findByCode(string $code): ?Promotion
    {
        return Promotion::where('code', strtoupper(trim($code)))->first();
    }

    /** @param string[] $relations */
    public function findByCodeWithRelations(string $code, array $relations): ?Promotion
    {
        return Promotion::where('code', strtoupper(trim($code)))
            ->with($relations)
            ->first();
    }

    public function findById(int $id): ?Promotion
    {
        return Promotion::find($id);
    }

    public function incrementRedemptionsCount(int $promotionId): void
    {
        DB::table('promotions')
            ->where('id', $promotionId)
            ->increment('redemptions_count');
    }
}
