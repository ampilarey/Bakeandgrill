<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Repositories;

use App\Models\LoyaltyLedger;

class EloquentLoyaltyLedgerRepository implements LoyaltyLedgerRepositoryInterface
{
    public function existsByIdempotencyKey(string $key): bool
    {
        return LoyaltyLedger::where('idempotency_key', $key)->exists();
    }

    public function createEntry(array $attributes): LoyaltyLedger
    {
        return LoyaltyLedger::create($attributes);
    }

    public function firstOrCreateByIdempotencyKey(string $key, array $attributes): LoyaltyLedger
    {
        return LoyaltyLedger::firstOrCreate(
            ['idempotency_key' => $key],
            $attributes,
        );
    }
}
