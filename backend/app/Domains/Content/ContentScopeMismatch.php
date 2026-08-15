<?php

declare(strict_types=1);

namespace App\Domains\Content;

use App\Domains\Settings\OpsOwnedContent;
use App\Models\SiteSetting;

/**
 * Notice-only drift between website, order app, and the shared business record.
 * Covers independently scoped brand/marketing facts — never page-wording blocks.
 *
 * Business Details–owned identity/contact keys (phone, email, address, …) are
 * excluded: ContentResolver always reads shared for those, so leftover
 * website/order_app rows are integrity cleanup — not live surface values.
 */
final class ContentScopeMismatch
{
    /**
     * Independently scoped keys that may still differ across shared / website / order_app.
     * Business Details–owned identity keys (phone, email, address, site_name, …) are
     * intentionally absent — see OpsOwnedContent::BUSINESS_DETAILS_KEYS.
     *
     * @var list<string>
     */
    public const KEYS = [
        // Marketing / catalog facts that may still differ per surface
        'site_tagline',
        'delivery_time',
        // delivery_threshold is Ordering Control owned — not a content mismatch key.
        'menu_new_days',
        // Brand assets (6) — still independently scoped per surface
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

            // Ops-owned Business Details keys always resolve from shared; leftover
            // app-scoped rows must not look like "Website says … / Order app says …".
            if (OpsOwnedContent::resolvesFromBusinessDetails($key)) {
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
