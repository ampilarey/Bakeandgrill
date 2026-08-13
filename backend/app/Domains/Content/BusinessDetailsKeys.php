<?php

declare(strict_types=1);

namespace App\Domains\Content;

/**
 * Shared-scope keys edited on the Business Details screen.
 *
 * Derived by intersecting SiteSetting::get('…') call sites under backend/app
 * with ContentRegistry content blocks (php artisan / script). Non-app consumers
 * (invoices, signage, SMS, complaints, offers, locale middleware, home chrome)
 * read these via SiteSetting::get() → shared only.
 */
final class BusinessDetailsKeys
{
    /** @var list<string> */
    public const KEYS = [
        'announcement_enabled',
        'business_address',
        'business_email',
        'business_phone',
        'business_website',
        'business_whatsapp',
        'language_switcher_enabled',
        'logo',
        'menu_new_days',
        'offers_headline',
        'offers_subtext',
        'primary_color',
        'site_name',
        'site_tagline',
    ];

    public static function isAllowed(string $key): bool
    {
        return in_array($key, self::KEYS, true);
    }

    /**
     * @return list<string>
     */
    public static function all(): array
    {
        return self::KEYS;
    }
}
