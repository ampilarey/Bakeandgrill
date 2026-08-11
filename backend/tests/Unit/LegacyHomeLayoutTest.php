<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Content\Blocks\LegacyHomeLayout;
use PHPUnit\Framework\TestCase;

/**
 * Replaces the old HomeSectionOrder unit test. The class is gone; the frozen
 * fixture that took over its job is still exercised by the migration gate.
 */
class LegacyHomeLayoutTest extends TestCase
{
    public function test_resolve_ignores_unknown_and_appends_missing_defaults(): void
    {
        $this->assertSame(
            ['cta', 'specials', 'featured', 'categories', 'proof', 'location'],
            LegacyHomeLayout::resolveOrder('["cta","unknown","specials"]'),
        );
    }

    public function test_resolve_deduplicates_and_falls_back_to_default_for_invalid_json(): void
    {
        $this->assertSame(
            ['categories', 'specials', 'featured', 'proof', 'cta', 'location'],
            LegacyHomeLayout::resolveOrder('["categories","categories","bogus"]'),
        );

        $this->assertSame(LegacyHomeLayout::SECTION_ORDER, LegacyHomeLayout::resolveOrder('{nope'));
    }

    public function test_enable_key_for_known_sections(): void
    {
        $this->assertSame('section_specials_enabled', LegacyHomeLayout::enableKeyFor('specials'));
        $this->assertSame('section_cta_enabled', LegacyHomeLayout::enableKeyFor('cta'));
        $this->assertNull(LegacyHomeLayout::enableKeyFor('unknown'));
    }

    public function test_frozen_default_snapshots_are_not_edited_casually(): void
    {
        $this->assertSame(
            ['hero', 'specials', 'featured', 'categories', 'proof', 'cta', 'location'],
            array_column(LegacyHomeLayout::WEBSITE_DEFAULT, 'type'),
        );
        $this->assertSame(
            [
                'greeting',
                'prayer_bar',
                'hero',
                'opening_status',
                'mode_cards',
                'specials',
                'reviews',
                'categories',
                'reorder_strip',
                'brand_footer',
            ],
            array_column(LegacyHomeLayout::ORDER_APP_DEFAULT, 'type'),
        );
        foreach ([...LegacyHomeLayout::WEBSITE_DEFAULT, ...LegacyHomeLayout::ORDER_APP_DEFAULT] as $row) {
            $this->assertTrue($row['enabled'], "Frozen default for {$row['type']} must be enabled.");
        }
    }
}
