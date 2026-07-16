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
     * @param int $subtotalLaar Discounted merchandise subtotal in laari (free-delivery threshold)
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
     * Uses round() like the rest of the money pipeline (not floor).
     */
    public function calculateLaar(string $island, int $subtotalLaar = 0): int
    {
        return (int) round($this->calculate($island, $subtotalLaar) * 100);
    }
}
