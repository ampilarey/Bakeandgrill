<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Item;
use App\Models\ItemPhoto;

/**
 * The JPEG (or PNG) a crawler should use as og:image for an item.
 *
 * WhatsApp / Viber / Facebook often refuse WebP-only images, and a card
 * thumbnail is too small for a preview. Prefer the full-size gallery
 * rendition; fall back to the site OG image, never a broken URL.
 *
 * @phpstan-type Preview array{url: string, alt: string}
 */
final class SocialPreviewImage
{
    /**
     * @return Preview
     */
    public function forItem(Item $item): array
    {
        $alt = $this->itemAlt($item);
        foreach ($this->candidates($item) as $candidate) {
            $url = PublicMediaUrl::absolute($candidate['url']);
            if ($url === null || !$this->isShareableRaster($url)) {
                continue;
            }

            $photoAlt = trim((string) ($candidate['alt'] ?? ''));

            return [
                'url' => $url,
                'alt' => $photoAlt !== '' ? $photoAlt : $alt,
            ];
        }

        return [
            'url' => $this->siteFallback(),
            'alt' => $alt,
        ];
    }

    public function siteFallback(): string
    {
        foreach ([
            content('og_image', ''),
            content('default_item_image', ''),
            asset('logo.png'),
        ] as $raw) {
            $url = PublicMediaUrl::absolute($raw);
            if ($url !== null && $this->isShareableRaster($url)) {
                return $url;
            }
        }

        return asset('logo.png');
    }

    /**
     * @return list<array{url: string, alt: ?string}>
     */
    private function candidates(Item $item): array
    {
        $out = [];
        $photos = $item->relationLoaded('photos')
            ? $item->photos
            : $item->photos()->get();

        $sorted = $photos->sort(function (ItemPhoto $a, ItemPhoto $b) {
            if ((bool) $a->is_primary !== (bool) $b->is_primary) {
                return $a->is_primary ? -1 : 1;
            }

            return $a->sort_order <=> $b->sort_order;
        })->values();

        foreach ($sorted as $photo) {
            if ($photo->isVideo()) {
                foreach ([$photo->poster_url, $photo->url] as $raw) {
                    if (trim((string) $raw) !== '') {
                        $out[] = ['url' => (string) $raw, 'alt' => $photo->alt_text];
                    }
                }

                continue;
            }

            // Full-size JPEG first — never the card thumbnail.
            foreach ([$photo->url, $photo->original_url] as $raw) {
                if (trim((string) $raw) !== '') {
                    $out[] = ['url' => (string) $raw, 'alt' => $photo->alt_text];
                }
            }
        }

        if (trim((string) $item->image_url) !== '') {
            $out[] = ['url' => (string) $item->image_url, 'alt' => null];
        }

        return $out;
    }

    private function itemAlt(Item $item): string
    {
        $name = trim((string) ($item->card_name ?: $item->name));

        return $name !== '' ? $name : 'Bake & Grill';
    }

    /**
     * Crawlers that build link previews are unreliable with WebP-only images.
     * JPEG/PNG/GIF are accepted; a path with no extension (CDN) is allowed
     * unless it is clearly WebP.
     */
    public function isShareableRaster(string $url): bool
    {
        $path = strtolower((string) (parse_url($url, PHP_URL_PATH) ?: $url));
        if (str_contains($path, '.webp')) {
            return false;
        }
        if (preg_match('/\.(jpe?g|png|gif)$/', $path) === 1) {
            return true;
        }

        return preg_match('/\.[a-z0-9]+$/', $path) !== 1;
    }
}
