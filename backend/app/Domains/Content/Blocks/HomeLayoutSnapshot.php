<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

use App\Domains\Content\ContentResolver;
use App\Domains\Content\HomeSectionOrder;
use App\Models\PageBlock;

/**
 * Captures the rendered section order + enabled set for each home page.
 * Used as the Stage B gate: before migration (legacy) must equal after (page_blocks).
 *
 * @phpstan-type SectionRow array{type: string, enabled: bool}
 */
final class HomeLayoutSnapshot
{
    /**
     * Legacy website layout: hero (gated) + HomeSectionOrder + section_*_enabled.
     *
     * @return list<SectionRow>
     */
    public static function legacyWebsite(): array
    {
        $resolver = ContentResolver::for('website');
        $rows = [];

        $rows[] = [
            'type' => 'hero',
            'enabled' => self::sectionEnabled($resolver->get('section_hero_enabled', 'true')),
        ];

        foreach (HomeSectionOrder::resolve($resolver->get('home_section_order', '[]')) as $id) {
            $enableKey = HomeSectionOrder::enableKeyFor($id);
            $enabled = $enableKey
                ? self::sectionEnabled($resolver->get($enableKey, 'true'))
                : true;
            $rows[] = ['type' => $id, 'enabled' => $enabled];
        }

        return $rows;
    }

    /**
     * Legacy order-app layout from the ACTUAL HomePage.tsx render order
     * (not what home_section_order alone implies).
     *
     * Phone chrome: greeting → prayer_bar → hero(+opening_status) → mode_cards
     * → ordered specials/categories with reviews inserted → reorder_strip → brand_footer.
     *
     * @return list<SectionRow>
     */
    public static function legacyOrderApp(): array
    {
        $resolver = ContentResolver::for('order_app');
        $heroOn = self::sectionEnabled($resolver->get('section_hero_enabled', 'true'));
        $specialsOn = self::sectionEnabled($resolver->get('section_specials_enabled', 'true'));
        $categoriesOn = self::sectionEnabled($resolver->get('section_categories_enabled', 'true'));
        $reviewsOn = self::sectionEnabled($resolver->get('section_reviews_enabled', 'true'));

        $rows = [
            ['type' => 'greeting', 'enabled' => true],
            ['type' => 'prayer_bar', 'enabled' => true],
            ['type' => 'hero', 'enabled' => $heroOn],
            // Opening status is shown inside the hero statusSlot today.
            ['type' => 'opening_status', 'enabled' => true],
            ['type' => 'mode_cards', 'enabled' => true],
        ];

        $order = HomeSectionOrder::resolve($resolver->get('home_section_order', '[]'));
        $reviewsInserted = false;
        $reviewAfterSpecials = $specialsOn;

        foreach ($order as $id) {
            if ($id === 'specials') {
                $rows[] = ['type' => 'specials', 'enabled' => $specialsOn];
                if ($reviewAfterSpecials && ! $reviewsInserted) {
                    $rows[] = ['type' => 'reviews', 'enabled' => $reviewsOn];
                    $reviewsInserted = true;
                }
                continue;
            }
            if ($id === 'categories') {
                $rows[] = ['type' => 'categories', 'enabled' => $categoriesOn];
                if (! $reviewAfterSpecials && ! $reviewsInserted) {
                    $rows[] = ['type' => 'reviews', 'enabled' => $reviewsOn];
                    $reviewsInserted = true;
                }
                continue;
            }
            // featured / proof / cta / location are in the CMS order list but
            // are NOT rendered on the order-app home — omit from snapshot.
        }

        if (! $reviewsInserted) {
            $rows[] = ['type' => 'reviews', 'enabled' => $reviewsOn];
        }

        $rows[] = ['type' => 'reorder_strip', 'enabled' => true];
        $rows[] = ['type' => 'brand_footer', 'enabled' => true];

        return $rows;
    }

    /**
     * Snapshot from page_blocks rows (authoritative after Stage B/C).
     *
     * @return list<SectionRow>
     */
    public static function fromPageBlocks(string $app, string $page = PageBlock::PAGE_HOME): array
    {
        return PageBlock::query()
            ->where('app', $app)
            ->where('page', $page)
            ->orderBy('position')
            ->orderBy('id')
            ->get(['block_type', 'is_enabled'])
            ->map(fn (PageBlock $b) => [
                'type' => $b->block_type,
                'enabled' => (bool) $b->is_enabled,
            ])
            ->values()
            ->all();
    }

    private static function sectionEnabled(mixed $raw): bool
    {
        if (is_bool($raw)) {
            return $raw;
        }
        $normalized = strtolower(trim((string) $raw));

        return ! in_array($normalized, ['false', '0', 'no', 'off'], true);
    }
}
