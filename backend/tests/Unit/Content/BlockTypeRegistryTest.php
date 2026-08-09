<?php

declare(strict_types=1);

namespace Tests\Unit\Content;

use App\Domains\Content\Blocks\BlockTypeRegistry;
use PHPUnit\Framework\TestCase;

class BlockTypeRegistryTest extends TestCase
{
    public function test_website_types_match_plan(): void
    {
        $types = array_map(fn ($d) => $d->type, BlockTypeRegistry::forApp('website'));
        foreach (['hero', 'specials', 'featured', 'categories', 'proof', 'cta', 'location', 'brand_footer'] as $expected) {
            $this->assertContains($expected, $types);
        }
        $this->assertNotContains('mode_cards', $types);
    }

    public function test_order_app_types_match_plan(): void
    {
        $types = array_map(fn ($d) => $d->type, BlockTypeRegistry::forApp('order_app'));
        foreach ([
            'hero', 'specials', 'categories', 'reviews', 'mode_cards', 'reorder_strip',
            'promo_carousel', 'greeting', 'prayer_bar', 'opening_status', 'brand_footer',
        ] as $expected) {
            $this->assertContains($expected, $types);
        }
        $this->assertNotContains('featured', $types);
    }

    public function test_mode_cards_and_brand_footer_are_non_removable(): void
    {
        $this->assertFalse(BlockTypeRegistry::isRemovable('mode_cards'));
        $this->assertFalse(BlockTypeRegistry::isRemovable('brand_footer'));
        $this->assertTrue(BlockTypeRegistry::isRemovable('specials'));
        $this->assertNotEmpty(BlockTypeRegistry::get('mode_cards')?->nonRemovableReason);
        $this->assertNotEmpty(BlockTypeRegistry::get('brand_footer')?->nonRemovableReason);
    }
}
