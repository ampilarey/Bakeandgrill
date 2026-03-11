<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Repositories;

use App\Models\LoyaltyLedger;

interface LoyaltyLedgerRepositoryInterface
{
    public function existsByIdempotencyKey(string $key): bool;

    public function createEntry(array $attributes): LoyaltyLedger;

    public function firstOrCreateByIdempotencyKey(string $key, array $attributes): LoyaltyLedger;
}
