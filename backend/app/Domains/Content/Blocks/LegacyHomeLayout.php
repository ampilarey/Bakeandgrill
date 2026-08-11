<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

use App\Models\SiteSetting;

/**
 * FROZEN record of the pre-builder home layout (the `home_section_order` +
 * `section_*_enabled` world), captured at Stage F.
 *
 * page_blocks is the only thing that renders a home page now. This class
 * exists so the migration gate keeps a fixed "before" to compare against and
 * so installs that have not run HomeLayoutMigrator yet can still be migrated
 * from their stored site_settings. Nothing here is read while rendering.
 *
 * Do NOT "update" these fixtures to match a new layout — that would silently
 * move the gate. They describe history.
 *
 * @phpstan-type SectionRow array{type: string, enabled: bool}
 */
final class LegacyHomeLayout
{
    /** Movable website sections, in their frozen default order. */
    public const SECTION_ORDER = ['specials', 'featured', 'categories', 'proof', 'cta', 'location'];

    /** Section id → the site_settings key that used to gate it. */
    public const ENABLE_KEYS = [
        'hero' => 'section_hero_enabled',
        'specials' => 'section_specials_enabled',
        'featured' => 'section_featured_enabled',
        'categories' => 'section_categories_enabled',
        'proof' => 'section_proof_enabled',
        'cta' => 'section_cta_enabled',
        'location' => 'section_location_enabled',
        'reviews' => 'section_reviews_enabled',
    ];

    /**
     * Website home with default settings, exactly as it rendered before the
     * page builder: gated hero, then the default section order.
     *
     * @var list<SectionRow>
     */
    public const WEBSITE_DEFAULT = [
        ['type' => 'hero', 'enabled' => true],
        ['type' => 'specials', 'enabled' => true],
        ['type' => 'featured', 'enabled' => true],
        ['type' => 'categories', 'enabled' => true],
        ['type' => 'proof', 'enabled' => true],
        ['type' => 'cta', 'enabled' => true],
        ['type' => 'location', 'enabled' => true],
    ];

    /**
     * Order-app home with default settings, taken from the ACTUAL HomePage.tsx
     * render order at migration time (not from home_section_order alone).
     *
     * @var list<SectionRow>
     */
    public const ORDER_APP_DEFAULT = [
        ['type' => 'greeting', 'enabled' => true],
        ['type' => 'prayer_bar', 'enabled' => true],
        ['type' => 'hero', 'enabled' => true],
        // Opening status was shown inside the hero statusSlot.
        ['type' => 'opening_status', 'enabled' => true],
        ['type' => 'mode_cards', 'enabled' => true],
        ['type' => 'specials', 'enabled' => true],
        ['type' => 'reviews', 'enabled' => true],
        ['type' => 'categories', 'enabled' => true],
        ['type' => 'reorder_strip', 'enabled' => true],
        ['type' => 'brand_footer', 'enabled' => true],
    ];

    /**
     * Resolve a stored order, ignoring unknown IDs and appending any sections
     * missing from the stored order at the end, in frozen default order.
     *
     * @return list<string>
     */
    public static function resolveOrder(mixed $raw): array
    {
        $decoded = self::decode($raw);
        $known = array_flip(self::SECTION_ORDER);
        $seen = [];
        $ordered = [];

        foreach ($decoded as $id) {
            if (! is_string($id) || ! isset($known[$id]) || isset($seen[$id])) {
                continue;
            }

            $seen[$id] = true;
            $ordered[] = $id;
        }

        foreach (self::SECTION_ORDER as $id) {
            if (! isset($seen[$id])) {
                $ordered[] = $id;
            }
        }

        return $ordered;
    }

    public static function enableKeyFor(string $id): ?string
    {
        return self::ENABLE_KEYS[$id] ?? null;
    }

    /**
     * Stored order for an app, straight from site_settings (app scope, then
     * shared), falling back to the frozen default.
     *
     * @return list<string>
     */
    public static function storedOrder(string $app): array
    {
        return self::resolveOrder(self::rawSetting($app, 'home_section_order'));
    }

    /** Legacy gate value: on unless explicitly turned off. */
    public static function sectionEnabled(string $app, string $sectionId): bool
    {
        $key = self::enableKeyFor($sectionId);
        if ($key === null) {
            return true;
        }

        $raw = self::rawSetting($app, $key);
        if ($raw === null) {
            return true;
        }
        if (is_bool($raw)) {
            return $raw;
        }

        return ! in_array(strtolower(trim((string) $raw)), ['false', '0', 'no', 'off'], true);
    }

    /**
     * Raw site_settings read. Deliberately bypasses ContentResolver: these
     * keys are retired from the content registry, so the migrator must not
     * depend on them still being registered.
     */
    private static function rawSetting(string $app, string $key): mixed
    {
        foreach ([$app, 'shared'] as $scope) {
            $value = SiteSetting::getScoped($key, $scope, 'en');
            if ($value !== null && $value !== '') {
                return $value;
            }
        }

        return null;
    }

    /** @return list<mixed> */
    private static function decode(mixed $raw): array
    {
        if (is_array($raw)) {
            return array_is_list($raw) ? $raw : [];
        }

        if (! is_string($raw) || trim($raw) === '') {
            return [];
        }

        $decoded = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE || ! is_array($decoded) || ! array_is_list($decoded)) {
            return [];
        }

        return $decoded;
    }
}
