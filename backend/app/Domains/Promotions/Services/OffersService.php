<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Services;

use App\Models\Item;
use App\Models\Promotion;
use App\Services\SpecialPricingService;
use Illuminate\Support\Facades\Cache;

/**
 * Unified public offers feed: active daily specials + active auto-promotions.
 */
class OffersService
{
    public const CACHE_KEY = 'offers:public_feed';

    private const CACHE_TTL_SECONDS = 60;

    public function __construct(
        private SpecialPricingService $specialPricing,
    ) {}

    public function bustCache(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function activeOffers(): array
    {
        try {
            return Cache::remember(self::CACHE_KEY, self::CACHE_TTL_SECONDS, fn () => $this->buildOffers());
        } catch (\Throwable) {
            return $this->buildOffers();
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function buildOffers(): array
    {
        $offers = [];

        foreach ($this->specialPricing->activeSpecialsForDisplay() as $sp) {
            $itemId = (int) ($sp['item_id'] ?? 0);
            $variantId = isset($sp['variant_id']) ? (int) $sp['variant_id'] : null;
            $link = $itemId > 0
                ? '/menu?item=' . $itemId . ($variantId ? '&variant=' . $variantId : '')
                : '/menu';

            $offers[] = [
                'id' => 'special-' . ($sp['id'] ?? 0) . ($variantId ? '-v' . $variantId : ''),
                'kind' => 'special',
                'title' => $sp['item_name'] ?? 'Special',
                'subtitle' => $sp['variant_name'] ?? null,
                'badge' => $sp['badge_label'] ?? ($sp['discount_pct'] ? $sp['discount_pct'] . '% OFF' : 'Special Offer'),
                'discount_pct' => $sp['discount_pct'] ?? null,
                'effective_price' => $sp['effective_price'] ?? null,
                'original_price' => $sp['original_price'] ?? null,
                'image_url' => $sp['item_image'] ?? null,
                'ends_at' => $sp['end_date'] ?? $sp['ends_at'] ?? null,
                'target' => [
                    'type' => 'item',
                    'item_id' => $itemId ?: null,
                    'variant_id' => $variantId,
                    'category_id' => null,
                ],
                'link' => $link,
            ];
        }

        $promos = Promotion::query()
            ->autoApply()
            ->active()
            ->with('targets')
            ->get()
            ->filter(fn (Promotion $p) => $p->isValid());

        foreach ($promos as $promo) {
            $inclusions = $promo->targets->where('is_exclusion', false);
            if ($inclusions->isEmpty()) {
                // Order-level auto-promo — surface as a cart offer card.
                $offers[] = $this->promoOfferRow($promo, [
                    'type' => 'order',
                    'item_id' => null,
                    'variant_id' => null,
                    'category_id' => null,
                ], '/menu', $promo->name);
                continue;
            }

            foreach ($inclusions as $target) {
                if ($target->target_type === 'item') {
                    $item = Item::query()->find($target->target_id);
                    if (!$item || !$item->is_active) {
                        continue;
                    }
                    $catalog = (float) $item->base_price;
                    $effective = $this->promoUnitPrice($promo, $catalog);
                    $offers[] = $this->promoOfferRow(
                        $promo,
                        [
                            'type' => 'item',
                            'item_id' => $item->id,
                            'variant_id' => null,
                            'category_id' => $item->category_id,
                        ],
                        '/menu?item=' . $item->id,
                        $item->name,
                        $item->display_image_url,
                        $effective,
                        $catalog,
                    );
                } elseif ($target->target_type === 'category') {
                    $offers[] = $this->promoOfferRow(
                        $promo,
                        [
                            'type' => 'category',
                            'item_id' => null,
                            'variant_id' => null,
                            'category_id' => (int) $target->target_id,
                        ],
                        '/menu?category=' . $target->target_id,
                        $promo->name,
                    );
                }
            }
        }

        return $offers;
    }

    /**
     * @param array{type: string, item_id: ?int, variant_id: ?int, category_id: ?int} $target
     * @return array<string, mixed>
     */
    private function promoOfferRow(
        Promotion $promo,
        array $target,
        string $link,
        string $title,
        ?string $imageUrl = null,
        ?float $effective = null,
        ?float $original = null,
    ): array {
        $badge = $promo->type === 'percentage'
            ? ((int) $promo->discount_value) . '% OFF'
            : ('MVR ' . number_format(((int) $promo->discount_value) / 100, 2) . ' OFF');

        return [
            'id' => 'promo-' . $promo->id . '-' . $target['type'] . '-' . ($target['item_id'] ?? $target['category_id'] ?? 'order'),
            'kind' => 'promo',
            'title' => $title,
            'subtitle' => $target['type'] === 'order' ? $promo->name : null,
            'badge' => $badge,
            'discount_pct' => $promo->type === 'percentage' ? (int) $promo->discount_value : null,
            'effective_price' => $effective,
            'original_price' => $original,
            'image_url' => $imageUrl,
            'ends_at' => $promo->expires_at?->toIso8601String(),
            'target' => $target,
            'link' => $link,
            'promotion_id' => $promo->id,
        ];
    }

    private function promoUnitPrice(Promotion $promo, float $catalogPrice): float
    {
        return match ($promo->type) {
            'percentage' => round($catalogPrice * (1 - ((int) $promo->discount_value) / 100), 2),
            'fixed' => max(0, round($catalogPrice - ((int) $promo->discount_value) / 100, 2)),
            default => $catalogPrice,
        };
    }
}
