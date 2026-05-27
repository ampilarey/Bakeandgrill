<?php

declare(strict_types=1);

namespace App\Services;

readonly class SpecialPriceResult
{
    public function __construct(
        public float $unitPrice,
        public float $originalPrice,
        public ?int $dailySpecialId = null,
        public ?int $discountPct = null,
        public ?string $badgeLabel = null,
    ) {}

    public function hasDiscount(): bool
    {
        return $this->dailySpecialId !== null && $this->unitPrice < $this->originalPrice;
    }

    /** @return array<string, mixed>|null */
    public function toApiBlock(): ?array
    {
        if (!$this->hasDiscount()) {
            return null;
        }

        return [
            'id' => $this->dailySpecialId,
            'badge_label' => $this->badgeLabel,
            'discount_pct' => $this->discountPct,
            'original_price' => $this->originalPrice,
            'effective_price' => $this->unitPrice,
        ];
    }
}
