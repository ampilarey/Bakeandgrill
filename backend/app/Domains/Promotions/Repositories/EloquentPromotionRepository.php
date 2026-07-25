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

    public function decrementRedemptionsCount(int $promotionId): void
    {
        DB::table('promotions')
            ->where('id', $promotionId)
            ->where('redemptions_count', '>', 0)
            ->decrement('redemptions_count');
    }

    public function incrementSpentLaar(int $promotionId, int $amountLaar): void
    {
        if ($amountLaar <= 0) {
            return;
        }
        DB::table('promotions')
            ->where('id', $promotionId)
            ->increment('spent_laar', $amountLaar);
    }

    public function decrementSpentLaar(int $promotionId, int $amountLaar): void
    {
        if ($amountLaar <= 0) {
            return;
        }
        $current = (int) DB::table('promotions')->where('id', $promotionId)->value('spent_laar');
        DB::table('promotions')
            ->where('id', $promotionId)
            ->update(['spent_laar' => max(0, $current - $amountLaar)]);
    }
}
