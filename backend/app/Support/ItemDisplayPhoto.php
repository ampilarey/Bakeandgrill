<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Item;
use App\Models\ItemPhoto;
use Illuminate\Support\Collection;

/**
 * The picture a server-rendered page should show for an item.
 *
 * Distinct from {@see SocialPreviewImage}, which answers a different question:
 * that one feeds crawlers and needs a large, non-WebP, absolute image. This
 * one feeds a hero on the page and prefers the card-sized rendition, with the
 * WebP alongside for a <picture>.
 *
 * `placeholder` marks the site-wide stand-in rather than a photo of this item.
 * The two want different framing: a real photo should fill its box, but the
 * stand-in is the logo, and cropping a logo into a wide hero slices the flame
 * off the top and the wordmark off the bottom.
 *
 * Extracted from MenuPageController so the offer pages show the same picture
 * the item page does, rather than a second copy that could drift.
 *
 * @phpstan-type DisplayPhoto array{url: ?string, webp: ?string, full: ?string, placeholder: bool}
 */
final class ItemDisplayPhoto
{
    /**
     * @param Collection<int, Item> $items
     * @return array<int, DisplayPhoto>
     */
    public function forItems(Collection $items): array
    {
        $default = $this->siteDefault();
        $out = [];
        foreach ($items as $item) {
            $out[$item->id] = $this->forItem($item, $default);
        }

        return $out;
    }

    /**
     * @return DisplayPhoto
     */
    public function forItem(Item $item, ?string $default = null): array
    {
        $default ??= $this->siteDefault();

        $photos = $item->photos
            ->sort(function (ItemPhoto $a, ItemPhoto $b) {
                if ((bool) $a->is_primary !== (bool) $b->is_primary) {
                    return $a->is_primary ? -1 : 1;
                }

                return $a->sort_order <=> $b->sort_order;
            })
            ->values();

        foreach ($photos as $photo) {
            if ($photo->isVideo()) {
                $url = PublicMediaUrl::absolute($photo->poster_url ?: $photo->thumb_url);
                if ($url) {
                    // A poster is the only still we have — it is both sizes.
                    return ['url' => $url, 'webp' => null, 'full' => $url, 'placeholder' => false];
                }

                continue;
            }

            $url = PublicMediaUrl::absolute($photo->thumb_url ?: $photo->url);
            if (!$url) {
                continue;
            }

            return [
                'url' => $url,
                'webp' => PublicMediaUrl::absolute($photo->thumb_webp_url ?: $photo->image_webp_url),
                'full' => PublicMediaUrl::absolute($photo->url) ?: $url,
                'placeholder' => false,
            ];
        }

        $url = PublicMediaUrl::absolute($item->thumb_url ?: $item->image_url);
        if ($url) {
            return [
                'url' => $url,
                'webp' => PublicMediaUrl::absolute($item->thumb_webp_url ?: $item->image_webp_url),
                'full' => PublicMediaUrl::absolute($item->image_url) ?: $url,
                'placeholder' => false,
            ];
        }

        return ['url' => $default, 'webp' => null, 'full' => $default, 'placeholder' => $default !== null];
    }

    private function siteDefault(): ?string
    {
        return PublicMediaUrl::absolute(content('default_item_image'));
    }
}
