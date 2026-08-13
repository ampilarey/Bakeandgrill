<?php

declare(strict_types=1);

namespace App\Domains\Content;

use App\Models\SiteSetting;

/**
 * Notice-only drift between website, order app, and the shared business record.
 * Covers business facts + brand assets — never page-wording blocks.
 */
final class ContentScopeMismatch
{
    /** @var list<string> */
    public const KEYS = [
        // Business facts (13)
        'business_phone',
        'business_whatsapp',
        'business_viber',
        'business_email',
        'business_address',
        'business_landmark',
        'business_maps_url',
        'business_website',
        'site_name',
        'site_tagline',
        'delivery_time',
        'delivery_threshold',
        'menu_new_days',
        // Brand assets (6)
        'logo',
        'logo_dark',
        'favicon',
        'og_image',
        'primary_color',
        'default_item_image',
    ];

    /**
     * @return list<array{
     *   key: string,
     *   label: string,
     *   message: string,
     *   shared: string,
     *   website: string,
     *   order_app: string
     * }>
     */
    public static function collect(string $locale = 'en'): array
    {
        $out = [];
        foreach (self::KEYS as $key) {
            if (! ContentRegistry::has($key)) {
                continue;
            }

            $shared = self::normalize(SiteSetting::getScoped($key, 'shared', $locale));
            $website = self::normalize(SiteSetting::getScoped($key, 'website', $locale));
            $orderApp = self::normalize(SiteSetting::getScoped($key, 'order_app', $locale));

            if ($shared === $website && $website === $orderApp) {
                continue;
            }

            $label = (string) (ContentRegistry::block($key)['label'] ?? $key);
            $out[] = [
                'key' => $key,
                'label' => $label,
                'message' => sprintf(
                    'Business record says %s · Website says %s · Order app says %s',
                    self::display($shared),
                    self::display($website),
                    self::display($orderApp),
                ),
                'shared' => $shared,
                'website' => $website,
                'order_app' => $orderApp,
            ];
        }

        return $out;
    }

    private static function normalize(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        return trim((string) $value);
    }

    private static function display(string $value): string
    {
        return $value === '' ? '(empty)' : $value;
    }
}
