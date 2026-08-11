<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

use App\Models\PageBlock;

/**
 * Captures the rendered section order + enabled set for each home page.
 * Used as the Stage B gate: before migration (legacy) must equal after (page_blocks).
 *
 * The legacy side is reconstructed from LegacyHomeLayout — a frozen fixture of
 * the pre-builder layout plus the stored site_settings that customised it.
 * No render path reads it.
 *
 * @phpstan-type SectionRow array{type: string, enabled: bool}
 */
final class HomeLayoutSnapshot
{
    /**
     * Legacy website layout: gated hero + stored section order + enable keys.
     *
     * @return list<SectionRow>
     */
    public static function legacyWebsite(): array
    {
        $app = PageBlock::APP_WEBSITE;
        $rows = [[
            'type' => 'hero',
            'enabled' => LegacyHomeLayout::sectionEnabled($app, 'hero'),
        ]];

        foreach (LegacyHomeLayout::storedOrder($app) as $id) {
            $rows[] = ['type' => $id, 'enabled' => LegacyHomeLayout::sectionEnabled($app, $id)];
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
        $app = PageBlock::APP_ORDER;
        $specialsOn = LegacyHomeLayout::sectionEnabled($app, 'specials');
        $categoriesOn = LegacyHomeLayout::sectionEnabled($app, 'categories');
        $reviewsOn = LegacyHomeLayout::sectionEnabled($app, 'reviews');

        $rows = [
            ['type' => 'greeting', 'enabled' => true],
            ['type' => 'prayer_bar', 'enabled' => true],
            ['type' => 'hero', 'enabled' => LegacyHomeLayout::sectionEnabled($app, 'hero')],
            // Opening status is shown inside the hero statusSlot today.
            ['type' => 'opening_status', 'enabled' => true],
            ['type' => 'mode_cards', 'enabled' => true],
        ];

        $reviewsInserted = false;
        $reviewAfterSpecials = $specialsOn;

        foreach (LegacyHomeLayout::storedOrder($app) as $id) {
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
}
