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
    /** @var list<string> */
    public const KEYS = [
        'business_address',
        'business_email',
        'business_phone',
        'business_website',
        'business_whatsapp',
        'logo',
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
