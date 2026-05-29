<?php

declare(strict_types=1);

namespace App\Domains\Delivery\Services;

/**
 * Calculates the delivery fee for an order.
 *
 * Fees and thresholds are loaded from site_settings via DeliverySettingsService,
 * with config/env fallback.
 *
 * All amounts in MVR (decimal). Converted to laari in the order pipeline.
 */
class DeliveryFeeCalculator
{
    public function __construct(
        private readonly DeliverySettingsService $settings,
    ) {}

    /**
     * Calculate delivery fee in MVR.
     *
     * @param string $island Destination island/atoll e.g. "Male", "Hulhumale"
     * @param int $subtotalLaar Order subtotal in laari (for potential threshold-based free delivery)
     */
    public function calculate(string $island, int $subtotalLaar = 0): float
    {
        $freeThreshold = $this->settings->freeThreshold();
        if ($freeThreshold > 0 && $subtotalLaar >= (int) round($freeThreshold * 100)) {
            return 0.0;
        }

        $zones = $this->settings->zoneFees();
        $normalizedIsland = mb_strtolower(trim($island));

        foreach ($zones as $zone => $fee) {
            if ($normalizedIsland === mb_strtolower($zone)) {
                return $fee;
            }
        }

        return $this->settings->defaultFee();
    }

    public function freeThresholdMvr(): float
    {
        return $this->settings->freeThreshold();
    }

    /**
     * Calculate delivery fee in laari (integer).
     */
    public function calculateLaar(string $island, int $subtotalLaar = 0): int
    {
        return (int) floor($this->calculate($island, $subtotalLaar) * 100);
    }
}
