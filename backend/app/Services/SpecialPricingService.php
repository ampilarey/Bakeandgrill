<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\DailySpecial;
use App\Models\DailySpecialVariant;
use App\Models\Item;
use App\Models\OrderItem;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SpecialPricingService
{
    private const CACHE_KEY = 'daily_specials:active_map';

    private const CACHE_TTL_SECONDS = 60;

    public const DEFAULT_BADGE_LABEL = 'Special Offer';

    /** @var Collection<int, DailySpecial>|null */
    private ?Collection $activeByItemId = null;

    public function bustCache(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    /**
     * @return Collection<int, DailySpecial> keyed by item_id
     */
    public function activeSpecialsByItemId(): Collection
    {
        if ($this->activeByItemId !== null) {
            return $this->activeByItemId;
        }

        /** @var Collection<int, DailySpecial> $map */
        try {
            $map = Cache::remember(self::CACHE_KEY, self::CACHE_TTL_SECONDS, fn () => $this->loadActiveSpecialsMap());
        } catch (\Throwable) {
            $map = $this->loadActiveSpecialsMap();
        }

        $this->activeByItemId = $map;

        return $map;
    }

    /** @return Collection<int, DailySpecial> */
    private function loadActiveSpecialsMap(): Collection
    {
        $with = [
            'item:id,name,base_price,has_variants,image_url',
            'item.variants:id,item_id,name,price,is_active,sort_order',
        ];
        if (Schema::hasTable('daily_special_variants')) {
            $with[] = 'variantOverrides';
        }

        return DailySpecial::query()
            ->where('is_active', true)
            ->where('start_date', '<=', today())
            ->where('end_date', '>=', today())
            ->with($with)
            ->get()
            ->filter(function (DailySpecial $s) {
                try {
                    return $s->isCurrentlyActive();
                } catch (\Throwable) {
                    return false;
                }
            })
            ->keyBy('item_id');
    }

    public function resolveUnitPrice(int $itemId, float $catalogPrice, ?Item $item = null, ?int $variantId = null): SpecialPriceResult
    {
        $special = $this->activeSpecialsByItemId()->get($itemId);

        if (!$special) {
            return new SpecialPriceResult($catalogPrice, $catalogPrice);
        }

        $original = $catalogPrice;
        $effective = $this->effectivePriceForSpecial($special, $catalogPrice, $item, $variantId);

        if ($effective >= $original) {
            return new SpecialPriceResult($catalogPrice, $catalogPrice);
        }

        $pct = $this->resolveDiscountPct($special, $original, $effective, $variantId);

        return new SpecialPriceResult(
            unitPrice: $effective,
            originalPrice: $original,
            dailySpecialId: $special->id,
            discountPct: $pct,
            badgeLabel: $special->badge_label ?? ($pct ? "{$pct}% OFF" : self::DEFAULT_BADGE_LABEL),
        );
    }

    public function effectivePriceForSpecial(DailySpecial $special, float $catalogPrice, ?Item $item = null, ?int $variantId = null): float
    {
        if ($variantId !== null) {
            $override = $this->findVariantOverride($special, $variantId);
            if ($override) {
                if ($override->discount_pct) {
                    return round($catalogPrice * (1 - $override->discount_pct / 100), 2);
                }
                if ($override->special_price !== null) {
                    return (float) $override->special_price;
                }
            }
        }

        if ($special->discount_pct) {
            return round($catalogPrice * (1 - $special->discount_pct / 100), 2);
        }

        if ($special->special_price !== null) {
            $hasVariants = $item?->has_variants ?? false;
            if (!$hasVariants) {
                return (float) $special->special_price;
            }
        }

        return $catalogPrice;
    }

    /** @return list<DailySpecial> */
    public function activeSpecialsList(): array
    {
        return $this->activeSpecialsByItemId()->values()->all();
    }

    /** @return list<array<string, mixed>> */
    public function activeSpecialsForDisplay(): array
    {
        $rows = [];
        foreach ($this->activeSpecialsList() as $special) {
            foreach ($this->expandSpecialForDisplay($special) as $row) {
                $rows[] = $row;
            }
        }

        return $rows;
    }

    /**
     * Flatten a special into one or more homepage/menu cards.
     * Variant items produce one card per discounted variant.
     *
     * @return list<array<string, mixed>>
     */
    public function expandSpecialForDisplay(DailySpecial $special): array
    {
        $item = $special->item;
        if (!$item) {
            return [];
        }

        if ($item->has_variants) {
            $variants = $item->relationLoaded('variants')
                ? $item->variants->where('is_active', true)->sortBy('sort_order')
                : $item->variants()->where('is_active', true)->orderBy('sort_order')->get();

            $rows = [];
            foreach ($variants as $variant) {
                $catalog = (float) $variant->price;
                $effective = $this->effectivePriceForSpecial($special, $catalog, $item, (int) $variant->id);
                if ($effective >= $catalog) {
                    continue;
                }
                $rows[] = $this->buildDisplayRow($special, $item, (int) $variant->id, $variant->name, $catalog, $effective);
            }

            if ($rows !== []) {
                return $rows;
            }
        }

        $catalog = (float) $item->base_price;
        $effective = $this->effectivePriceForSpecial($special, $catalog, $item);
        if ($effective >= $catalog && $special->special_price === null && !$special->discount_pct) {
            return [];
        }

        return [$this->buildDisplayRow($special, $item, null, null, $catalog, $effective)];
    }

    /** @return array<string, mixed> */
    private function buildDisplayRow(
        DailySpecial $special,
        Item $item,
        ?int $variantId,
        ?string $variantName,
        float $catalogPrice,
        float $effectivePrice,
    ): array {
        $pct = $this->resolveDiscountPct($special, $catalogPrice, $effectivePrice, $variantId);

        return [
            'id' => $special->id,
            'item_id' => $item->id,
            'variant_id' => $variantId,
            'item_name' => $item->name,
            'variant_name' => $variantName,
            'item_image' => $item->display_image_url ?? $item->image_url,
            'badge_label' => $this->resolveBadgeLabel($special, $pct),
            'discount_pct' => $pct,
            'original_price' => $catalogPrice,
            'effective_price' => $effectivePrice,
        ];
    }

    private function resolveBadgeLabel(DailySpecial $special, ?int $discountPct): string
    {
        if ($special->badge_label) {
            return $special->badge_label === 'Special' ? self::DEFAULT_BADGE_LABEL : $special->badge_label;
        }

        $pct = $discountPct ?? $special->discount_pct;

        return $pct ? "{$pct}% OFF" : self::DEFAULT_BADGE_LABEL;
    }

    /**
     * Check whether a capped special still has room for this quantity,
     * counting paid sold_count plus unpaid orders already holding the special.
     */
    public function canAllocateSpecialQuantity(int $specialId, int $quantity, int $orderId): bool
    {
        return DB::transaction(function () use ($specialId, $quantity, $orderId): bool {
            $special = DailySpecial::lockForUpdate()->find($specialId);
            if (!$special || !$special->max_quantity) {
                return true;
            }

            $unpaidQty = (int) OrderItem::query()
                ->where('daily_special_id', $specialId)
                ->where('order_id', '!=', $orderId)
                ->whereHas('order', fn ($q) => $q->where('payment_status', '!=', 'paid'))
                ->sum('quantity');

            $remaining = $special->max_quantity - $special->sold_count - $unpaidQty;

            return $quantity <= $remaining;
        });
    }

    private function findVariantOverride(DailySpecial $special, int $variantId): ?DailySpecialVariant
    {
        if (!Schema::hasTable('daily_special_variants')) {
            return null;
        }

        if ($special->relationLoaded('variantOverrides')) {
            return $special->variantOverrides->firstWhere('variant_id', $variantId);
        }

        return $special->variantOverrides()->where('variant_id', $variantId)->first();
    }

    private function resolveDiscountPct(DailySpecial $special, float $original, float $effective, ?int $variantId): ?int
    {
        if ($variantId !== null) {
            $override = $this->findVariantOverride($special, $variantId);
            if ($override?->discount_pct) {
                return $override->discount_pct;
            }
        }

        if ($special->discount_pct) {
            return $special->discount_pct;
        }

        if ($original > 0 && $effective < $original) {
            return (int) round((1 - ($effective / $original)) * 100);
        }

        return null;
    }
}
