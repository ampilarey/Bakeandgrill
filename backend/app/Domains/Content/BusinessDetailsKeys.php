<?php

declare(strict_types=1);

namespace App\Domains\Content;

/**
 * Shared-scope keys edited on the Business Details screen.
 *
 * Document / operations record only (invoices, receipts, signage, SMS).
 * Not Website or Order App branding — those apps have their own Content Hub.
 */
final class BusinessDetailsKeys
{
    /**
     * Section → editable shared keys (order preserved in the Admin UI).
     * A key may appear in more than one section for display; {@see all()} is unique.
     *
     * @var array<string, list<string>>
     */
    public const SECTIONS = [
        'identity' => [
            'site_name',
            'business_website',
            'business_phone',
            'business_email',
        ],
        'address' => [
            'business_address',
            'business_address_line1',
            'business_address_city',
            'business_address_country',
            'business_landmark',
            'business_maps_url',
            'maps_embed_url',
        ],
        'contact' => [
            'business_phone',
            'business_email',
            'business_whatsapp',
            'business_viber',
        ],
        'documents' => [
            'site_tagline',
            'logo',
            'primary_color',
        ],
        'brand' => [
            'logo_dark',
            'favicon',
            'og_image',
            'default_item_image',
        ],
        'social' => [
            'show_social_links',
            'social_instagram',
            'social_facebook',
            'social_tiktok',
        ],
        'tracking' => [
            'google_analytics_id',
            'google_tag_manager_id',
        ],
    ];

    /**
     * Read-only “Used by” hints for owners (shared record consumers).
     *
     * @var array<string, list<string>>
     */
    public const USED_BY = [
        'site_name' => [
            'Receipts & invoices',
            'TV signage',
            'Website / Order App (only when not overridden in Content & Branding)',
        ],
        'business_website' => [
            'Operational reference',
            'Customer SMS footers (when used)',
        ],
        'business_address' => [
            'Receipts & invoices',
            'TV signage',
            'Order App pickup address (when not overridden)',
            'Website contact/footer (when not overridden)',
        ],
        'business_address_line1' => ['Structured address (shared record)'],
        'business_address_city' => ['Structured address (shared record)'],
        'business_address_country' => ['Structured address (shared record)'],
        'business_landmark' => [
            'Pickup / directions',
            'Website contact (when not overridden)',
        ],
        'business_maps_url' => [
            'Google Maps buttons',
            'Website contact / Order App directions (when not overridden)',
        ],
        'maps_embed_url' => [
            'Website contact map embed (when not overridden)',
        ],
        'business_phone' => [
            'Receipts & invoices',
            'TV signage',
            'Operational / customer SMS',
            'Website contact/footer (when not overridden)',
            'Order App contact (when not overridden)',
        ],
        'business_email' => [
            'Receipts & invoices',
            'Operational SMS',
            'Website contact/footer (when not overridden)',
            'Order App contact (when not overridden)',
        ],
        'business_whatsapp' => [
            'Customer contact channels',
            'Website contact (when not overridden)',
        ],
        'business_viber' => [
            'Customer contact channels',
            'Website contact (when not overridden)',
        ],
        'site_tagline' => ['Receipts & invoices', 'TV signage', 'Website', 'Order App'],
        'logo' => ['Receipts & invoices', 'TV signage', 'Website', 'Order App'],
        'primary_color' => ['Receipts & invoices', 'TV signage', 'Website', 'Order App'],
        'logo_dark' => ['Website', 'Order App'],
        'favicon' => ['Website browser tab', 'Order App browser tab'],
        'og_image' => ['Website link previews', 'Order App link previews'],
        'default_item_image' => ['Menu items with no photo (Website + Order App)'],
        'show_social_links' => ['Website footer', 'Order App footer'],
        'social_instagram' => ['Website footer', 'Order App footer'],
        'social_facebook' => ['Website footer', 'Order App footer'],
        'social_tiktok' => ['Website footer', 'Order App footer'],
        'google_analytics_id' => ['Website visitor tracking', 'Order App visitor tracking'],
        'google_tag_manager_id' => ['Website visitor tracking', 'Order App visitor tracking'],
    ];

    /** @return list<string> */
    public static function all(): array
    {
        $keys = [];
        foreach (self::SECTIONS as $sectionKeys) {
            foreach ($sectionKeys as $key) {
                $keys[$key] = true;
            }
        }

        return array_keys($keys);
    }

    public static function isAllowed(string $key): bool
    {
        return in_array($key, self::all(), true);
    }

    /** @return list<string> */
    public static function usedBy(string $key): array
    {
        return self::USED_BY[$key] ?? [];
    }
}
