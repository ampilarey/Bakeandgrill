<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Unified display/checkout price for an item line.
 * toApiBlock() matches SpecialPriceResult so frontends keep the `special` shape.
 */
readonly class EffectivePriceResult
{
    public function __construct(
        public float $unitPrice,
        public float $originalPrice,
        public ?string $badgeLabel = null,
        public ?int $discountPct = null,
        public string $source = 'none',
        public ?int $specialId = null,
        public ?int $promoId = null,
    ) {}

    public function hasDiscount(): bool
    {
        return $this->unitPrice < $this->originalPrice
            && ($this->specialId !== null || $this->promoId !== null);
    }

    /** @return array<string, mixed>|null */
    public function toApiBlock(): ?array
    {
        if (!$this->hasDiscount()) {
            return null;
        }

        return [
            'id' => $this->specialId ?? $this->promoId,
            'badge_label' => $this->badgeLabel,
            'discount_pct' => $this->discountPct,
            'original_price' => $this->originalPrice,
            'effective_price' => $this->unitPrice,
        ];
    }
}
