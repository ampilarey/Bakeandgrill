<?php

declare(strict_types=1);

namespace App\Domains\Delivery\Services;

use App\Models\SiteSetting;

/**
 * Resolves delivery fees and thresholds from site_settings with config fallback.
 */
class DeliverySettingsService
{
    /**
     * @return array{
     *     default_fee: float,
     *     free_threshold: float,
     *     zone_fees: array<string, float>,
     *     zone_whitelist: list<string>|null,
     *     zones_enforced: bool,
     *     source: string
     * }
     */
    public function resolve(): array
    {
        $zoneFees = $this->zoneFees();
        $whitelist = $this->zoneWhitelist();

        return [
            'default_fee' => $this->defaultFee(),
            'free_threshold' => $this->freeThreshold(),
            'zone_fees' => $zoneFees,
            'zone_whitelist' => $whitelist,
            'zones_enforced' => $whitelist !== null,
            'source' => $this->usesDatabaseSettings() ? 'database' : 'config',
        ];
    }

    public function defaultFee(): float
    {
        $raw = SiteSetting::get('delivery_default_fee');
        if ($raw !== null && $raw !== '') {
            return max(0.0, (float) $raw);
        }

        return max(0.0, (float) config('delivery.default_fee', 30.00));
    }

    public function freeThreshold(): float
    {
        $raw = SiteSetting::get('delivery_free_threshold');
        if ($raw !== null && $raw !== '') {
            return max(0.0, (float) $raw);
        }

        return max(0.0, (float) config('delivery.free_threshold', 200.00));
    }

    /**
     * @return array<string, float>
     */
    public function zoneFees(): array
    {
        $raw = SiteSetting::get('delivery_zone_fees');
        if ($raw) {
            try {
                $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
                if (is_array($decoded) && !empty($decoded)) {
                    $fees = [];
                    foreach ($decoded as $zone => $fee) {
                        if (!is_string($zone) && !is_int($zone)) {
                            continue;
                        }
                        $name = trim((string) $zone);
                        if ($name === '') {
                            continue;
                        }
                        $fees[$name] = max(0.0, (float) $fee);
                    }

                    if (!empty($fees)) {
                        return $fees;
                    }
                }
            } catch (\JsonException) {
                // fall through to config
            }
        }

        $configured = config('delivery.zones', []);
        if (!is_array($configured) || empty($configured)) {
            return [
                'Male' => 20.00,
                'Hulhumale' => 30.00,
                'Vilimale' => 30.00,
                'Maafushi' => 50.00,
            ];
        }

        $fees = [];
        foreach ($configured as $zone => $fee) {
            $fees[(string) $zone] = max(0.0, (float) $fee);
        }

        return $fees;
    }

    /**
     * @return list<string>|null Lowercase zone slugs, or null when all zones allowed
     */
    public function zoneWhitelist(): ?array
    {
        $raw = SiteSetting::get('delivery_zones');
        if (!$raw) {
            return null;
        }
        try {
            $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return null;
        }

        if (!is_array($decoded) || empty($decoded)) {
            return null;
        }

        return array_values(array_filter(array_map(
            fn ($z) => strtolower(trim((string) $z)),
            $decoded,
        )));
    }

    /**
     * @param array{
     *     default_fee: float|int,
     *     free_threshold: float|int,
     *     zone_fees: array<string, float|int>,
     *     restrict_to_zone_fees?: bool,
     *     zone_whitelist?: list<string>|null
     * } $data
     * @return array<string, mixed>
     */
    public function update(array $data): array
    {
        SiteSetting::set('delivery_default_fee', (string) max(0, (float) $data['default_fee']));
        SiteSetting::set('delivery_free_threshold', (string) max(0, (float) $data['free_threshold']));

        $zoneFees = [];
        foreach ($data['zone_fees'] as $zone => $fee) {
            $name = trim((string) $zone);
            if ($name === '') {
                continue;
            }
            $zoneFees[$name] = max(0.0, (float) $fee);
        }
        SiteSetting::set('delivery_zone_fees', json_encode($zoneFees, JSON_THROW_ON_ERROR));

        if (!empty($data['restrict_to_zone_fees'])) {
            $whitelist = array_values(array_map(
                fn ($name) => strtolower(trim($name)),
                array_keys($zoneFees),
            ));
            SiteSetting::set('delivery_zones', json_encode($whitelist, JSON_THROW_ON_ERROR));
        } elseif (array_key_exists('zone_whitelist', $data)) {
            $whitelist = $data['zone_whitelist'];
            if (is_array($whitelist) && !empty($whitelist)) {
                $normalised = array_values(array_filter(array_map(
                    fn ($z) => strtolower(trim((string) $z)),
                    $whitelist,
                )));
                SiteSetting::set('delivery_zones', json_encode($normalised, JSON_THROW_ON_ERROR));
            } else {
                SiteSetting::set('delivery_zones', null);
            }
        }

        SiteSetting::bust();

        return $this->resolve();
    }

    private function usesDatabaseSettings(): bool
    {
        return SiteSetting::get('delivery_default_fee') !== null
            || SiteSetting::get('delivery_free_threshold') !== null
            || SiteSetting::get('delivery_zone_fees') !== null;
    }
}
