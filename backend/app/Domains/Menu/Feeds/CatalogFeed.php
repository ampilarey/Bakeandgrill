<?php

declare(strict_types=1);

namespace App\Domains\Menu\Feeds;

use App\Models\Item;
use App\Models\SiteSetting;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Catalogue feeds behind a secret link (iruali import plan, feature 11):
 * Facebook / Instagram (CSV) and Google Merchant Center (XML). One row per dish
 * and per size, with photo, price, availability and the dish page.
 *
 * Dishes kept off sale (switched off for good, inactive, coming soon) are left
 * out; a sold-out or snoozed dish stays in as out of stock. The rows are
 * cached for 30 minutes under the menu's last change, so an edit rebuilds them.
 */
final class CatalogFeed
{
    public const TOKEN_KEY = 'catalog_feed_token';

    /** The secret in the link, made on first use. */
    public static function token(): string
    {
        $token = (string) SiteSetting::get(self::TOKEN_KEY, '');
        if (strlen($token) < 32) {
            $token = self::rotate();
        }

        return $token;
    }

    public static function rotate(): string
    {
        $token = Str::random(40);
        SiteSetting::set(self::TOKEN_KEY, $token);
        SiteSetting::bust();

        return $token;
    }

    public static function matches(string $token): bool
    {
        $current = (string) SiteSetting::get(self::TOKEN_KEY, '');

        return strlen($current) >= 32 && hash_equals($current, $token);
    }

    /** @return array{google: string, facebook: string} */
    public static function links(): array
    {
        $base = rtrim((string) config('app.url'), '/') . '/feeds/' . self::token();

        return ['google' => $base . '/google.xml', 'facebook' => $base . '/facebook.csv'];
    }

    /**
     * @return list<array{id: string, group: string, title: string, description: string, availability: string, price: string, link: string, image: string, category: string}>
     */
    public static function rows(): array
    {
        $version = (string) (Item::query()->max('updated_at') ?? '0');

        return Cache::remember('catalog-feed:' . md5($version), now()->addMinutes(30), function (): array {
            $rows = [];
            $items = Item::query()->where('is_active', true)
                ->with(['category:id,name', 'variants' => fn ($q) => $q->where('is_active', true)->orderBy('sort_order')])
                ->orderBy('id')->get();
            foreach ($items as $item) {
                if ($item->isComingSoon() || (float) $item->base_price <= 0 && $item->variants->isEmpty()) {
                    continue;
                }
                $inStock = (bool) $item->is_available && !$item->isSnoozed();
                $base = [
                    'group' => 'item-' . $item->id,
                    'description' => self::text((string) ($item->description ?: $item->short_description ?: $item->name)),
                    'link' => url('/menu/' . $item->id),
                    'image' => self::absolute((string) ($item->image_original_url ?: $item->image_url)),
                    'category' => (string) ($item->category?->name ?? ''),
                ];
                $name = (string) ($item->card_name ?: $item->name);
                if ($item->variants->isEmpty()) {
                    $rows[] = $base + [
                        'id' => 'item-' . $item->id,
                        'title' => self::text($name),
                        'availability' => $inStock ? 'in stock' : 'out of stock',
                        'price' => number_format((float) $item->base_price, 2, '.', '') . ' MVR',
                    ];

                    continue;
                }
                foreach ($item->variants as $variant) {
                    $rows[] = $base + [
                        'id' => 'item-' . $item->id . '-v' . $variant->id,
                        'title' => self::text($name . ' (' . $variant->name . ')'),
                        'availability' => $inStock && $variant->is_available !== false ? 'in stock' : 'out of stock',
                        'price' => number_format((float) $variant->price, 2, '.', '') . ' MVR',
                    ];
                }
            }

            return $rows;
        });
    }

    public static function csv(): string
    {
        $out = fopen('php://temp', 'r+');
        fputcsv($out, ['id', 'item_group_id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'product_type']);
        foreach (self::rows() as $r) {
            fputcsv($out, [$r['id'], $r['group'], $r['title'], $r['description'], $r['availability'], 'new', $r['price'], $r['link'], $r['image'], 'Bake & Grill', $r['category']]);
        }
        rewind($out);
        $csv = (string) stream_get_contents($out);
        fclose($out);

        return $csv;
    }

    public static function xml(): string
    {
        $e = fn (string $v) => htmlspecialchars($v, ENT_XML1 | ENT_QUOTES, 'UTF-8');
        $lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
            '<channel>',
            '<title>Bake &amp; Grill menu</title>',
            '<link>' . $e(url('/menu')) . '</link>',
            '<description>Dishes from Bake &amp; Grill, Malé</description>',
        ];
        foreach (self::rows() as $r) {
            $lines[] = '<item>'
                . '<g:id>' . $e($r['id']) . '</g:id>'
                . '<g:item_group_id>' . $e($r['group']) . '</g:item_group_id>'
                . '<title>' . $e($r['title']) . '</title>'
                . '<description>' . $e($r['description']) . '</description>'
                . '<link>' . $e($r['link']) . '</link>'
                . ($r['image'] !== '' ? '<g:image_link>' . $e($r['image']) . '</g:image_link>' : '')
                . '<g:availability>' . $e($r['availability']) . '</g:availability>'
                . '<g:price>' . $e($r['price']) . '</g:price>'
                . '<g:condition>new</g:condition>'
                . '<g:brand>Bake &amp; Grill</g:brand>'
                . ($r['category'] !== '' ? '<g:product_type>' . $e($r['category']) . '</g:product_type>' : '')
                . '</item>';
        }
        $lines[] = '</channel>';
        $lines[] = '</rss>';

        return implode("\n", $lines) . "\n";
    }

    private static function text(string $value): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', strip_tags($value)));
    }

    private static function absolute(string $url): string
    {
        if ($url === '') {
            return '';
        }

        return preg_match('#^https?://#i', $url) ? $url : url($url);
    }
}
