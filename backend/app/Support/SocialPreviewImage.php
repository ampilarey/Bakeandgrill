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
            if ($url === null || !$this->isShareableRaster($url) || !$this->resolves($url)) {
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
            if ($url !== null && $this->isShareableRaster($url) && $this->resolves($url)) {
                return $url;
            }
        }

        return asset('logo.png');
    }

    /**
     * Does this URL actually serve a file?
     *
     * A crawler that fetches a 404 shows NO preview image at all, so a
     * setting left pointing at deleted media is worse than having no
     * setting. Owner, 2026-09-01: items without a photo shared as a bare
     * link because `og_image` still named a media file that had been
     * removed — every page on the site was emitting that dead URL.
     *
     * Only locally-hosted files are checked (a stat, no network). An
     * off-site CDN URL is trusted: verifying it would mean an HTTP call
     * on every page render.
     */
    private function resolves(string $url): bool
    {
        $path = parse_url($url, PHP_URL_PATH);
        if (!is_string($path) || $path === '') {
            return false;
        }

        $host = parse_url($url, PHP_URL_HOST);
        $ownHost = parse_url(url('/'), PHP_URL_HOST);
        if (is_string($host) && is_string($ownHost) && strcasecmp($host, $ownHost) !== 0) {
            return true;
        }

        // public_path() resolves /storage through the storage:link symlink.
        return is_file(public_path(ltrim(rawurldecode($path), '/')));
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
