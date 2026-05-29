<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Models\Order;
use App\Models\SiteSetting;

class PackagingFeeCalculator
{
    public const MAX_PERCENT = 100.0;

    public const MAX_FIXED_MVR = 500.0;

    public function calculatePackaging(Order $order, int $discountedSubtotalLaar): int
    {
        if ($discountedSubtotalLaar <= 0) {
            return 0;
        }

        if (!$this->boolSetting('packaging_fee_enabled', false)) {
            return 0;
        }

        $orderType = (string) ($order->type ?? '');
        if (!$this->orderTypeEligible($orderType)) {
            return 0;
        }

        $type = $this->stringSetting('packaging_fee_type', 'fixed');
        if (!in_array($type, ['percent', 'fixed'], true)) {
            return 0;
        }

        $value = (float) $this->stringSetting('packaging_fee_value', '0');
        if ($value < 0) {
            return 0;
        }

        if ($type === 'percent') {
            $value = min($value, self::MAX_PERCENT);
            $rateBp = (int) round($value * 100);

            return max(0, (int) round($discountedSubtotalLaar * $rateBp / 10000));
        }

        $value = min($value, self::MAX_FIXED_MVR);

        return max(0, (int) round($value * 100));
    }

    public function calculateSmallOrder(Order $order, int $discountedSubtotalLaar): int
    {
        if ($discountedSubtotalLaar <= 0) {
            return 0;
        }

        if (!$this->boolSetting('small_order_fee_enabled', false)) {
            return 0;
        }

        $orderType = (string) ($order->type ?? '');
        if (!in_array($orderType, ['online_pickup', 'delivery'], true)) {
            return 0;
        }

        $thresholdMvr = (float) $this->stringSetting('small_order_fee_threshold_mvr', '0');
        $thresholdLaar = (int) round(max(0, $thresholdMvr) * 100);

        if ($discountedSubtotalLaar >= $thresholdLaar) {
            return 0;
        }

        $feeMvr = (float) $this->stringSetting('small_order_fee_amount_mvr', '0');
        $feeMvr = min(max(0, $feeMvr), self::MAX_FIXED_MVR);

        return max(0, (int) round($feeMvr * 100));
    }

    public function orderTypeEligible(string $orderType): bool
    {
        return match ($orderType) {
            'delivery' => $this->boolSetting('packaging_fee_apply_delivery', false),
            'online_pickup' => $this->boolSetting('packaging_fee_apply_online_pickup', false),
            default => false,
        };
    }

    /**
     * @return array<string, mixed>
     */
    public function currentSettings(): array
    {
        return [
            'packaging_enabled' => $this->boolSetting('packaging_fee_enabled', false),
            'packaging_label' => $this->stringSetting('packaging_fee_label', 'Packaging fee'),
            'packaging_type' => $this->stringSetting('packaging_fee_type', 'fixed'),
            'packaging_value' => (float) $this->stringSetting('packaging_fee_value', '0'),
            'packaging_apply_delivery' => $this->boolSetting('packaging_fee_apply_delivery', true),
            'packaging_apply_online_pickup' => $this->boolSetting('packaging_fee_apply_online_pickup', true),
            'small_order_enabled' => $this->boolSetting('small_order_fee_enabled', false),
            'small_order_threshold_mvr' => (float) $this->stringSetting('small_order_fee_threshold_mvr', '50'),
            'small_order_amount_mvr' => (float) $this->stringSetting('small_order_fee_amount_mvr', '10'),
            'ordering_max_per_15min' => (int) $this->stringSetting('ordering_max_per_15min', '0'),
            'ramadan_hours_preset' => $this->jsonSetting('ramadan_hours_preset'),
        ];
    }

    public function orderingMaxPer15Min(): int
    {
        return max(0, (int) $this->stringSetting('ordering_max_per_15min', '0'));
    }

    /**
     * @return array<string, mixed>|null
     */
    private function jsonSetting(string $key): ?array
    {
        $raw = SiteSetting::get($key, null);
        if ($raw === null || $raw === '') {
            return null;
        }

        if (is_array($raw)) {
            return $raw;
        }

        $decoded = json_decode((string) $raw, true);

        return is_array($decoded) ? $decoded : null;
    }

    private function boolSetting(string $key, bool $default): bool
    {
        $v = SiteSetting::get($key, $default ? '1' : '0');

        return filter_var($v, FILTER_VALIDATE_BOOLEAN);
    }

    private function stringSetting(string $key, string $default): string
    {
        $v = SiteSetting::get($key, $default);

        return is_string($v) ? $v : (string) $v;
    }
}
