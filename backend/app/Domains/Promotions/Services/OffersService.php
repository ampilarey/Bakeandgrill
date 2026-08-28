<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Services;

use App\Models\Item;
use App\Models\Promotion;
use App\Services\SpecialPricingService;
use App\Support\ResilientCache;

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
        ResilientCache::forget(self::CACHE_KEY);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function activeOffers(): array
    {
        try {
            return ResilientCache::remember(self::CACHE_KEY, self::CACHE_TTL_SECONDS, fn () => $this->buildOffers());
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
                'special_id' => (int) ($sp['id'] ?? 0),
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
        $badge = $this->promoBadgeLabel($promo);

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

    private function promoBadgeLabel(Promotion $promo): string
    {
        $meta = is_array($promo->metadata) ? $promo->metadata : [];

        return match ($promo->type) {
            'percentage' => ((int) $promo->discount_value) . '% OFF',
            'fixed' => 'MVR ' . number_format(((int) $promo->discount_value) / 100, 2) . ' OFF',
            'free_item' => 'Free item',
            'buy_x_get_y' => sprintf(
                'Buy %d Get %d',
                max(1, (int) ($meta['buy_qty'] ?? 1)),
                max(1, (int) ($meta['get_qty'] ?? 1)),
            ),
            'tiered' => $this->tieredBadge($meta),
            'quantity_break' => sprintf(
                'Buy %d+',
                max(1, (int) ($meta['min_qty'] ?? 1)),
            ),
            'free_delivery' => $promo->min_order_laar
                ? ('Free delivery over ' . number_format(((int) $promo->min_order_laar) / 100, 0))
                : 'Free delivery',
            default => $promo->waive_delivery
                ? 'Free delivery'
                : ('MVR ' . number_format(((int) $promo->discount_value) / 100, 2) . ' OFF'),
        };
    }

    /** @param array<string, mixed> $meta */
    private function tieredBadge(array $meta): string
    {
        $tiers = $meta['tiers'] ?? [];
        if (!is_array($tiers) || $tiers === []) {
            return 'Spend & save';
        }
        usort($tiers, fn ($a, $b) => ((int) ($a['min_laar'] ?? 0)) <=> ((int) ($b['min_laar'] ?? 0)));
        $first = $tiers[0];
        $min = (int) ($first['min_laar'] ?? 0);
        $kind = (string) ($first['kind'] ?? 'fixed');
        $value = (int) ($first['value'] ?? 0);
        if ($kind === 'percentage') {
            return sprintf('Spend %s save %d%%', number_format($min / 100, 0), $value);
        }

        return sprintf('Spend %s save %s', number_format($min / 100, 0), number_format($value / 100, 0));
    }
}
