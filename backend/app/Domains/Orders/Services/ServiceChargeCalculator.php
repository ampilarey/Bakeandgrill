<?php

declare(strict_types=1);

namespace App\Domains\Orders\Services;

use App\Domains\Orders\DTOs\ServiceChargeBreakdown;
use App\Models\Order;
use App\Models\SiteSetting;

class ServiceChargeCalculator
{
    public const MAX_PERCENT = 100.0;

    public const MAX_FIXED_MVR = 500.0;

    private const ORDER_TYPE_APPLY_KEYS = [
        'dine_in' => 'service_charge_apply_dine_in',
        'takeaway' => 'service_charge_apply_takeaway',
        'online_pickup' => 'service_charge_apply_online_pickup',
        'delivery' => 'service_charge_apply_delivery',
    ];

    public function calculate(Order $order, int $discountedSubtotalLaar): ServiceChargeBreakdown
    {
        if ($discountedSubtotalLaar <= 0) {
            return ServiceChargeBreakdown::zero();
        }

        $enabled = $this->boolSetting('service_charge_enabled', false);
        if (!$enabled) {
            return ServiceChargeBreakdown::zero();
        }

        $orderType = (string) ($order->type ?? '');
        if (!$this->orderTypeEligible($orderType)) {
            return ServiceChargeBreakdown::zero();
        }

        $type = $this->stringSetting('service_charge_type', 'percent');
        if (!in_array($type, ['percent', 'fixed'], true)) {
            return ServiceChargeBreakdown::zero();
        }

        $value = (float) $this->stringSetting('service_charge_value', '0');
        if ($value < 0) {
            return ServiceChargeBreakdown::zero();
        }

        $label = trim($this->stringSetting('service_charge_label', 'Service charge'));
        if ($label === '') {
            $label = 'Service charge';
        }

        $taxable = $this->boolSetting('service_charge_taxable', true);
        $rateBp = 0;
        $amountLaar = 0;

        if ($type === 'percent') {
            $value = min($value, self::MAX_PERCENT);
            $rateBp = (int) round($value * 100);
            $amountLaar = (int) round($discountedSubtotalLaar * $rateBp / 10000);
        } else {
            $value = min($value, self::MAX_FIXED_MVR);
            $amountLaar = (int) round($value * 100);
        }

        $amountLaar = max(0, $amountLaar);

        return new ServiceChargeBreakdown(
            enabled: $amountLaar > 0,
            label: $label,
            type: $type,
            value: $value,
            rateBp: $rateBp,
            amountLaar: $amountLaar,
            amount: round($amountLaar / 100, 2),
            taxable: $taxable,
            appliedTo: $orderType,
        );
    }

    public function orderTypeEligible(string $orderType): bool
    {
        $key = self::ORDER_TYPE_APPLY_KEYS[$orderType] ?? null;
        if ($key === null) {
            return false;
        }

        return $this->boolSetting($key, false);
    }

    /**
     * @return array<string, mixed>
     */
    public function currentSettings(): array
    {
        return [
            'enabled' => $this->boolSetting('service_charge_enabled', false),
            'label' => $this->stringSetting('service_charge_label', 'Service charge'),
            'type' => $this->stringSetting('service_charge_type', 'percent'),
            'value' => (float) $this->stringSetting('service_charge_value', '10'),
            'apply_dine_in' => $this->boolSetting('service_charge_apply_dine_in', true),
            'apply_takeaway' => $this->boolSetting('service_charge_apply_takeaway', false),
            'apply_online_pickup' => $this->boolSetting('service_charge_apply_online_pickup', false),
            'apply_delivery' => $this->boolSetting('service_charge_apply_delivery', false),
            'taxable' => $this->boolSetting('service_charge_taxable', true),
            'show_on_receipts' => $this->boolSetting('show_service_charge_on_receipts', true),
        ];
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
