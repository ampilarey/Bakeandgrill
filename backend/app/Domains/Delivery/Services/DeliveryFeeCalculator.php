<?php

declare(strict_types=1);

namespace App\Domains\Delivery\Services;

/**
 * Calculates the delivery fee for an order.
 *
 * Current implementation: flat fee from config, per island zone.
 * Future: can be replaced with a DB-driven fee table.
 *
 * All amounts in MVR (decimal). Converted to laari in the order pipeline.
 */
class DeliveryFeeCalculator
{
    /**
     * Calculate delivery fee in MVR.
     *
     * @param string $island Destination island/atoll e.g. "Male", "Hulhumale"
     * @param int $subtotalLaar Order subtotal in laari (for potential threshold-based free delivery)
     */
    public function calculate(string $island, int $subtotalLaar = 0): float
    {
        $zones = $this->zones();
        $normalizedIsland = mb_strtolower(trim($island));

        foreach ($zones as $zone => $fee) {
            if ($normalizedIsland === mb_strtolower($zone)) {
                return $fee;
            }
        }

        // Default zone fee
        return (float) config('delivery.default_fee', 30.00);
    }

    /**
     * Calculate delivery fee in laari (integer).
     */
    public function calculateLaar(string $island, int $subtotalLaar = 0): int
    {
        return (int) floor($this->calculate($island, $subtotalLaar) * 100);
    }

    /**
     * Zone => fee map (MVR). Loaded from config or defaults.
     */
    private function zones(): array
    {
        $configured = config('delivery.zones', []);

        if (!empty($configured)) {
            return $configured;
        }

        // Sensible Maldives defaults
        return [
            'Male' => 20.00,
            'Hulhumale' => 30.00,
            'Vilimale' => 30.00,
            'Maafushi' => 50.00,
        ];
    }
}
