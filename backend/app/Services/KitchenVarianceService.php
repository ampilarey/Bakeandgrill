<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\KitchenProductionVariance;
use App\Models\User;
use Illuminate\Http\Request;

class KitchenVarianceService
{
    public function __construct(
        private readonly AuditLogService $audit,
    ) {}

    /** @return \Illuminate\Contracts\Pagination\LengthAwarePaginator */
    public function list(?bool $reviewed = null, int $perPage = 20)
    {
        $query = KitchenProductionVariance::with(['batch', 'productionItem', 'recorder'])
            ->orderByDesc('created_at');

        if ($reviewed === true) {
            $query->whereNotNull('reviewed_at');
        } elseif ($reviewed === false) {
            $query->whereNull('reviewed_at');
        }

        return $query->paginate($perPage);
    }

    /** @param array{notes?: string|null} $payload */
    public function review(KitchenProductionVariance $variance, User $user, array $payload, ?Request $request = null): KitchenProductionVariance
    {
        $variance->update([
            'reviewed_by' => $user->id,
            'reviewed_at' => now(),
            'notes' => $payload['notes'] ?? $variance->notes,
        ]);

        $this->audit->log(
            'kitchen.variance.reviewed',
            'KitchenProductionVariance',
            $variance->id,
            [],
            ['reviewed_at' => $variance->reviewed_at?->toIso8601String()],
            ['batch_id' => $variance->kitchen_production_batch_id, 'user_id' => $user->id],
            $request,
        );

        return $variance->fresh();
    }
}
