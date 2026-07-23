<?php

declare(strict_types=1);

namespace App\Domains\Promotions\Services;

use App\Models\Item;
use App\Models\Promotion;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

/**
 * Resolves the best item/category-targeted auto-apply promotion for a catalog price.
 * Order-level auto-promos (no inclusion targets) are excluded — those stay cart-level.
 */
class AutoPromotionPricing
{
    public const CACHE_KEY = 'auto_promos:active_item_map';

    private const CACHE_TTL_SECONDS = 60;

    /** @var Collection<int, list<Promotion>>|null keyed by item_id */
    private ?Collection $byItemId = null;

    /** @var Collection<int, list<Promotion>>|null keyed by category_id */
    private ?Collection $byCategoryId = null;

    /** @var list<Promotion>|null */
    private ?array $categoryWide = null;

    public function bustCache(): void
    {
        Cache::forget(self::CACHE_KEY);
        $this->byItemId = null;
        $this->byCategoryId = null;
        $this->categoryWide = null;
    }

    /**
     * Best unit price after applying an item-level auto-promo (or catalog if none).
     *
     * @return array{unit_price: float, original_price: float, promotion: ?Promotion, discount_pct: ?int, badge_label: ?string}
     */
    public function resolveForItem(int $itemId, float $catalogPrice, ?Item $item = null): array
    {
        $this->ensureLoaded();

        $categoryId = $item?->category_id;
        if ($categoryId === null && $item === null) {
            $categoryId = Item::query()->whereKey($itemId)->value('category_id');
        }

        $candidates = collect($this->byItemId->get($itemId, []))
            ->merge($categoryId ? $this->byCategoryId->get((int) $categoryId, []) : [])
            ->unique('id')
            ->filter(fn (Promotion $p) => $p->isValid())
            ->values();

        if ($candidates->isEmpty()) {
            return [
                'unit_price' => $catalogPrice,
                'original_price' => $catalogPrice,
                'promotion' => null,
                'discount_pct' => null,
                'badge_label' => null,
            ];
        }

        $best = null;
        $bestPrice = $catalogPrice;

        foreach ($candidates as $promo) {
            $price = $this->applyPromoToPrice($promo, $catalogPrice);
            if ($price < $bestPrice) {
                $bestPrice = $price;
                $best = $promo;
            }
        }

        if ($best === null || $bestPrice >= $catalogPrice) {
            return [
                'unit_price' => $catalogPrice,
                'original_price' => $catalogPrice,
                'promotion' => null,
                'discount_pct' => null,
                'badge_label' => null,
            ];
        }

        $pct = null;
        if ($best->type === 'percentage') {
            $pct = (int) $best->discount_value;
        } elseif ($catalogPrice > 0) {
            $pct = (int) round((1 - $bestPrice / $catalogPrice) * 100);
        }

        return [
            'unit_price' => $bestPrice,
            'original_price' => $catalogPrice,
            'promotion' => $best,
            'discount_pct' => $pct,
            'badge_label' => $pct ? "{$pct}% OFF" : ($best->name ?: 'Offer'),
        ];
    }

    private function applyPromoToPrice(Promotion $promo, float $catalogPrice): float
    {
        return match ($promo->type) {
            'percentage' => round($catalogPrice * (1 - ((int) $promo->discount_value) / 100), 2),
            'fixed' => max(0, round($catalogPrice - ((int) $promo->discount_value) / 100, 2)),
            default => $catalogPrice,
        };
    }

    private function ensureLoaded(): void
    {
        if ($this->byItemId !== null) {
            return;
        }

        try {
            $payload = Cache::remember(self::CACHE_KEY, self::CACHE_TTL_SECONDS, fn () => $this->loadMaps());
        } catch (\Throwable) {
            $payload = $this->loadMaps();
        }

        $this->byItemId = collect($payload['by_item'] ?? []);
        $this->byCategoryId = collect($payload['by_category'] ?? []);
    }

    /**
     * @return array{by_item: array<int, list<Promotion>>, by_category: array<int, list<Promotion>>}
     */
    private function loadMaps(): array
    {
        $promos = Promotion::query()
            ->autoApply()
            ->active()
            ->with('targets')
            ->get()
            ->filter(fn (Promotion $p) => $p->isValid() && $p->targets->where('is_exclusion', false)->isNotEmpty());

        $byItem = [];
        $byCategory = [];

        foreach ($promos as $promo) {
            foreach ($promo->targets->where('is_exclusion', false) as $target) {
                if ($target->target_type === 'item') {
                    $byItem[(int) $target->target_id][] = $promo;
                } elseif ($target->target_type === 'category') {
                    $byCategory[(int) $target->target_id][] = $promo;
                }
            }
        }

        return ['by_item' => $byItem, 'by_category' => $byCategory];
    }
}
