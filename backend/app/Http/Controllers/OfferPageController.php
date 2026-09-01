<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Promotions\Services\OffersService;
use App\Models\DailySpecial;
use App\Models\Item;
use App\Models\Promotion;
use App\Services\EffectivePriceService;
use App\Support\ItemDisplayPhoto;
use App\Support\SocialPreviewImage;
use Illuminate\Contracts\View\View;

/**
 * Stable public landing pages for specials and auto-promotions.
 *
 * /menu#offers cannot carry its own OG tags. These documents can, and they
 * stay up after the offer ends so an old social post is not a dead link.
 */
class OfferPageController extends Controller
{
    public function special(int $special): View
    {
        $row = DailySpecial::query()->find($special);
        if ($row === null) {
            abort(404);
        }

        $item = Item::query()
            ->withTrashed()
            ->with(['photos', 'variants', 'category'])
            ->find($row->item_id);
        $active = $row->isCurrentlyActive();
        $price = $item ? $this->currentPrice($item) : null;
        $social = $item
            ? app(SocialPreviewImage::class)->forItem($item)
            : ['url' => app(SocialPreviewImage::class)->siteFallback(), 'alt' => $row->badge_label ?: 'Offer'];

        return view('offer', [
            'kind' => 'special',
            'offerActive' => $active,
            'headline' => $item?->name ?? ($row->badge_label ?: 'Special'),
            'badge' => $row->badge_label,
            'description' => $row->description,
            'endedLabel' => 'This offer has ended',
            'item' => $item,
            'price' => $price,
            'socialImage' => $social,
            // The same picture the item page shows, from the same resolver.
            'photo' => $item ? app(ItemDisplayPhoto::class)->forItem($item) : null,
            'canonicalPath' => '/offers/special/' . $row->id,
            'addToOrderHref' => $item ? '/order/menu?item=' . $item->id : '/order/menu',
            'currentOffers' => $active ? [] : app(OffersService::class)->activeOffers(),
            'menuLocale' => $this->menuLocale(),
        ]);
    }

    public function promo(int $promotion): View
    {
        $row = Promotion::query()->with('targets')->find($promotion);
        if ($row === null) {
            abort(404);
        }

        $active = $row->isValid();
        $item = $this->firstTargetItem($row);
        $price = $item ? $this->currentPrice($item) : null;
        $social = $item
            ? app(SocialPreviewImage::class)->forItem($item)
            : ['url' => app(SocialPreviewImage::class)->siteFallback(), 'alt' => $row->name];

        return view('offer', [
            'kind' => 'promo',
            'offerActive' => $active,
            'headline' => $item?->name ?? $row->name,
            'badge' => $row->name,
            'description' => null,
            'endedLabel' => 'This offer has ended',
            'item' => $item,
            'price' => $price,
            'socialImage' => $social,
            'photo' => $item ? app(ItemDisplayPhoto::class)->forItem($item) : null,
            'canonicalPath' => '/offers/promo/' . $row->id,
            'addToOrderHref' => $item ? '/order/menu?item=' . $item->id : '/order/menu',
            'currentOffers' => $active ? [] : app(OffersService::class)->activeOffers(),
            'menuLocale' => $this->menuLocale(),
        ]);
    }

    /**
     * @return array{price: float, was: float|null, from: bool}|null
     */
    private function currentPrice(Item $item): ?array
    {
        $item->loadMissing(['variants', 'photos']);
        $pricing = app(EffectivePriceService::class);
        $variants = $item->variants->where('is_active', true);

        if ($item->has_variants && $variants->isNotEmpty()) {
            $bestPrice = null;
            $bestWas = null;
            foreach ($variants as $variant) {
                $resolved = $pricing->resolveUnitPrice(
                    $item->id,
                    (float) $variant->price,
                    $item,
                    $variant->id,
                );
                if ($bestPrice === null || $resolved->unitPrice < $bestPrice) {
                    $bestPrice = (float) $resolved->unitPrice;
                    $bestWas = $resolved->hasDiscount() ? (float) $resolved->originalPrice : null;
                }
            }

            return ['price' => (float) $bestPrice, 'was' => $bestWas, 'from' => true];
        }

        $resolved = $pricing->resolveUnitPrice($item->id, (float) $item->base_price, $item);

        return [
            'price' => (float) $resolved->unitPrice,
            'was' => $resolved->hasDiscount() ? (float) $resolved->originalPrice : null,
            'from' => false,
        ];
    }

    private function firstTargetItem(Promotion $promo): ?Item
    {
        $target = $promo->targets->first(function ($row) {
            return !$row->is_exclusion && $row->target_type === 'item';
        });
        if ($target === null) {
            return null;
        }

        return Item::query()->withTrashed()->with(['photos', 'variants'])->find($target->target_id);
    }

    private function menuLocale(): string
    {
        return app()->bound('content.locale') ? (string) app('content.locale') : 'en';
    }
}
