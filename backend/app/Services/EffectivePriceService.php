<?php

declare(strict_types=1);

namespace App\Services;

use App\Domains\Promotions\Services\AutoPromotionPricing;
use App\Models\Item;
use App\Models\SiteSetting;

/**
 * Single authoritative price resolver: daily specials + item-level auto-promos.
 * Stacking policy default: best_wins (customer gets the single lowest unit price).
 */
class EffectivePriceService
{
    public function __construct(
        private SpecialPricingService $specialPricing,
        private AutoPromotionPricing $autoPromoPricing,
    ) {}

    public function resolveUnitPrice(
        int $itemId,
        float $catalogPrice,
        ?Item $item = null,
        ?int $variantId = null,
    ): EffectivePriceResult {
        $special = $this->specialPricing->resolveUnitPrice($itemId, $catalogPrice, $item, $variantId);
        $promo = $this->autoPromoPricing->resolveForItem($itemId, $catalogPrice, $item);

        $policy = (string) SiteSetting::get('discount_stacking_policy', 'best_wins');

        $specialPrice = $special->hasDiscount() ? $special->unitPrice : $catalogPrice;
        $promoPrice = $promo['promotion'] !== null ? (float) $promo['unit_price'] : $catalogPrice;

        if ($policy === 'stack' && $special->hasDiscount() && $promo['promotion'] !== null) {
            // Apply promo %/fixed on top of the special price (rare; off by default).
            $stacked = $this->stackOnto($specialPrice, $promo);
            if ($stacked < $catalogPrice) {
                $pct = $catalogPrice > 0 ? (int) round((1 - $stacked / $catalogPrice) * 100) : null;

                return new EffectivePriceResult(
                    unitPrice: $stacked,
                    originalPrice: $catalogPrice,
                    badgeLabel: $promo['badge_label'] ?? $special->badgeLabel,
                    discountPct: $pct,
                    source: 'promo',
                    specialId: $special->dailySpecialId,
                    promoId: $promo['promotion']->id,
                );
            }
        }

        // best_wins: pick the lower unit price.
        if ($special->hasDiscount() && $promo['promotion'] !== null) {
            if ($promoPrice < $specialPrice) {
                return $this->fromPromo($promo, $catalogPrice);
            }

            return $this->fromSpecial($special);
        }

        if ($promo['promotion'] !== null && $promoPrice < $catalogPrice) {
            return $this->fromPromo($promo, $catalogPrice);
        }

        if ($special->hasDiscount()) {
            return $this->fromSpecial($special);
        }

        return new EffectivePriceResult($catalogPrice, $catalogPrice);
    }

    /**
     * @param array{unit_price: float, original_price: float, promotion: mixed, discount_pct: ?int, badge_label: ?string} $promo
     */
    private function stackOnto(float $basePrice, array $promo): float
    {
        $promotion = $promo['promotion'];
        if ($promotion === null) {
            return $basePrice;
        }

        return match ($promotion->type) {
            'percentage' => round($basePrice * (1 - ((int) $promotion->discount_value) / 100), 2),
            'fixed' => max(0, round($basePrice - ((int) $promotion->discount_value) / 100, 2)),
            default => $basePrice,
        };
    }

    private function fromSpecial(SpecialPriceResult $special): EffectivePriceResult
    {
        return new EffectivePriceResult(
            unitPrice: $special->unitPrice,
            originalPrice: $special->originalPrice,
            badgeLabel: $special->badgeLabel,
            discountPct: $special->discountPct,
            source: 'special',
            specialId: $special->dailySpecialId,
            promoId: null,
        );
    }

    /**
     * @param array{unit_price: float, original_price: float, promotion: mixed, discount_pct: ?int, badge_label: ?string} $promo
     */
    private function fromPromo(array $promo, float $catalogPrice): EffectivePriceResult
    {
        return new EffectivePriceResult(
            unitPrice: (float) $promo['unit_price'],
            originalPrice: $catalogPrice,
            badgeLabel: $promo['badge_label'],
            discountPct: $promo['discount_pct'],
            source: 'promo',
            specialId: null,
            promoId: $promo['promotion']?->id,
        );
    }
}
