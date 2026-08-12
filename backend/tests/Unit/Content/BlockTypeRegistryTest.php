<?php

declare(strict_types=1);

namespace Tests\Unit\Content;

use App\Domains\Content\Blocks\BlockTypeRegistry;
use PHPUnit\Framework\TestCase;

class BlockTypeRegistryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        BlockTypeRegistry::flush();
    }

    public function test_library_is_available_on_both_apps(): void
    {
        $website = array_map(fn ($d) => $d->type, BlockTypeRegistry::forApp('website'));
        $order = array_map(fn ($d) => $d->type, BlockTypeRegistry::forApp('order_app'));

        foreach ([
            'greeting', 'prayer_bar', 'hero', 'announcement', 'service_availability',
            'opening_status', 'stat_chips', 'mode_cards', 'specials', 'featured',
            'categories', 'trust_strip', 'proof', 'reviews', 'reorder_strip', 'cta',
            'location', 'events_band', 'office_orders', 'brand_footer', 'rich_text',
            'image', 'image_text', 'video', 'button_band', 'faq_list', 'divider',
        ] as $type) {
            $this->assertContains($type, $website, "{$type} must be on website");
            $this->assertContains($type, $order, "{$type} must be on order_app");
        }
    }

    public function test_promo_carousel_is_deprecated_and_hidden_from_add_lists(): void
    {
        $this->assertTrue(BlockTypeRegistry::isKnown('promo_carousel'));
        $this->assertTrue(BlockTypeRegistry::get('promo_carousel')?->deprecated);
        $this->assertNotContains(
            'promo_carousel',
            array_map(fn ($d) => $d->type, BlockTypeRegistry::forApp('order_app')),
        );
    }

    public function test_mode_cards_and_brand_footer_are_removable_with_flow_warnings(): void
    {
        $this->assertTrue(BlockTypeRegistry::isRemovable('mode_cards'));
        $this->assertTrue(BlockTypeRegistry::isRemovable('brand_footer'));
        $this->assertNotEmpty(BlockTypeRegistry::get('mode_cards')?->flowWarning);
        $this->assertNotEmpty(BlockTypeRegistry::get('brand_footer')?->flowWarning);
    }

    public function test_generic_types_are_removable_and_repeatable(): void
    {
        foreach (['rich_text', 'image', 'image_text', 'button_band', 'divider', 'video', 'faq_list'] as $type) {
            $this->assertTrue(BlockTypeRegistry::isRemovable($type), "{$type} must be removable.");
            $this->assertTrue(BlockTypeRegistry::allowsMultiple($type), "{$type} must be repeatable.");
        }

        $this->assertFalse(BlockTypeRegistry::allowsMultiple('hero'));
        $this->assertFalse(BlockTypeRegistry::allowsMultiple('prayer_bar'));
    }

    public function test_faq_supports_shared_content_on_both_apps(): void
    {
        $this->assertTrue(BlockTypeRegistry::get('faq_list')?->supportsSharedContent);
        $this->assertTrue(BlockTypeRegistry::get('faq_list')?->allowsApp('order_app'));
    }
}
