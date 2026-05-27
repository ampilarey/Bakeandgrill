<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\DailySpecial;
use App\Models\DailySpecialVariant;
use App\Models\Item;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

class SpecialPricingService
{
    private const CACHE_KEY = 'daily_specials:active_map';

    private const CACHE_TTL_SECONDS = 60;

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
        $with = ['item:id,name,base_price,has_variants,image_url'];
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
            badgeLabel: $special->badge_label ?? ($pct ? "{$pct}% OFF" : 'Special'),
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
