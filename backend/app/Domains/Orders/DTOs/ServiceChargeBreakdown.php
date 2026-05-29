<?php

declare(strict_types=1);

namespace App\Domains\Orders\DTOs;

/**
 * Service charge calculation result — snapshotted on orders at calculation time.
 */
final readonly class ServiceChargeBreakdown
{
    public function __construct(
        public bool $enabled,
        public string $label,
        public ?string $type,
        public ?float $value,
        public int $rateBp,
        public int $amountLaar,
        public float $amount,
        public bool $taxable,
        public ?string $appliedTo,
    ) {}

    public static function zero(): self
    {
        return new self(
            enabled: false,
            label: 'Service charge',
            type: null,
            value: null,
            rateBp: 0,
            amountLaar: 0,
            amount: 0.0,
            taxable: true,
            appliedTo: null,
        );
    }

    public function toOrderAttributes(): array
    {
        return [
            'service_charge_enabled' => $this->enabled,
            'service_charge_type' => $this->type,
            'service_charge_rate_bp' => $this->rateBp,
            'service_charge_value' => $this->value,
            'service_charge_amount_laar' => $this->amountLaar,
            'service_charge_amount' => $this->amount,
            'service_charge_label' => $this->label,
            'service_charge_taxable' => $this->taxable,
            'service_charge_applied_to' => $this->appliedTo,
        ];
    }

    public static function fromOrderSnapshot(\App\Models\Order $order): self
    {
        return new self(
            enabled: (bool) ($order->service_charge_enabled ?? false),
            label: (string) ($order->service_charge_label ?? 'Service charge'),
            type: $order->service_charge_type,
            value: $order->service_charge_value !== null ? (float) $order->service_charge_value : null,
            rateBp: (int) ($order->service_charge_rate_bp ?? 0),
            amountLaar: (int) ($order->service_charge_amount_laar ?? 0),
            amount: (float) ($order->service_charge_amount ?? 0),
            taxable: (bool) ($order->service_charge_taxable ?? true),
            appliedTo: $order->service_charge_applied_to,
        );
    }
}
