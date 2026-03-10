<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Repositories;

use App\Models\LoyaltyAccount;

interface LoyaltyAccountRepositoryInterface
{
    public function getOrCreateAccount(int $customerId): LoyaltyAccount;

    /** Lock the account row FOR UPDATE — must be called inside a DB::transaction(). */
    public function lockAccount(int $customerId): ?LoyaltyAccount;

    public function incrementPointsHeld(int $customerId, int $points): void;

    public function updateBalance(int $customerId, int $balance, ?int $addLifetime = null): void;

    public function decrementPointsHeld(int $customerId, int $points): void;
}
