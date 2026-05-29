<?php

declare(strict_types=1);

namespace App\Domains\Loyalty\Services;

use App\Models\LoyaltyAccount;
use App\Services\LoyaltySettingsService;

class LoyaltyTierService
{
    public function __construct(
        private readonly LoyaltySettingsService $settings,
    ) {}

    /**
     * @return array<string, mixed>|null
     */
    public function tierProgress(LoyaltyAccount $account): ?array
    {
        return $this->settings->tierProgress(
            (int) $account->lifetime_points,
            $account->tier,
        );
    }
}
