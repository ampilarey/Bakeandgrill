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

    public function test_generic_content_types_are_available_on_both_apps_except_faq(): void
    {
        $website = array_map(fn ($d) => $d->type, BlockTypeRegistry::forApp('website'));
        $orderApp = array_map(fn ($d) => $d->type, BlockTypeRegistry::forApp('order_app'));

        foreach (['rich_text', 'image', 'image_text', 'button_band', 'divider', 'video'] as $type) {
            $this->assertContains($type, $website, "{$type} should be offered on the website.");
            $this->assertContains($type, $orderApp, "{$type} should be offered on the order app.");
        }

        // FAQ answers website-visitor questions; it would only interrupt an order.
        $this->assertContains('faq_list', $website);
        $this->assertNotContains('faq_list', $orderApp);
    }

    public function test_generic_types_are_removable_and_repeatable(): void
    {
        foreach (['rich_text', 'image', 'image_text', 'button_band', 'divider', 'video', 'faq_list'] as $type) {
            $this->assertTrue(BlockTypeRegistry::isRemovable($type), "{$type} must be removable.");
            $this->assertTrue(BlockTypeRegistry::allowsMultiple($type), "{$type} must be repeatable.");
        }

        // Named sections stay one-per-page.
        $this->assertFalse(BlockTypeRegistry::allowsMultiple('hero'));
        $this->assertFalse(BlockTypeRegistry::allowsMultiple('specials'));
    }

    public function test_shared_content_support_matches_the_stage_e_decisions(): void
    {
        foreach (['rich_text', 'image', 'image_text', 'button_band', 'video'] as $type) {
            $this->assertTrue(
                BlockTypeRegistry::get($type)?->supportsSharedContent,
                "{$type} carries words or media worth sharing between apps.",
            );
        }

        // A divider has no content payload, and the FAQ list is website-only.
        $this->assertFalse(BlockTypeRegistry::get('divider')?->supportsSharedContent);
        $this->assertFalse(BlockTypeRegistry::get('faq_list')?->supportsSharedContent);
    }

    public function test_generic_types_declare_settings_schemas(): void
    {
        $this->assertArrayHasKey('body', BlockTypeRegistry::get('rich_text')?->settingsSchema ?? []);
        $this->assertArrayHasKey('media_id', BlockTypeRegistry::get('image')?->settingsSchema ?? []);
        $this->assertSame('left', BlockTypeRegistry::get('image_text')?->settingsDefaults['side'] ?? null);
        $this->assertSame('spacer', BlockTypeRegistry::get('divider')?->settingsDefaults['style'] ?? null);
    }
}
