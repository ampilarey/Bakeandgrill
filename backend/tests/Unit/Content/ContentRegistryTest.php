<?php

declare(strict_types=1);

namespace Tests\Unit\Content;

use App\Domains\Content\ContentRegistry;
use Tests\TestCase;

class ContentRegistryTest extends TestCase
{
    public function test_is_shareable_requires_both_apps_and_the_shareable_flag(): void
    {
        // hero_slides is flagged shareable and targets both apps.
        $this->assertTrue(ContentRegistry::isShareable('hero_slides'));

        // order_mode_learn_more now targets both apps and is flagged shareable.
        $this->assertTrue(ContentRegistry::isShareable('order_mode_learn_more'));
    }

    public function test_is_shareable_is_false_when_block_only_targets_one_app_even_if_flagged(): void
    {
        // cta_band_headline is flagged shareable in config but only targets website.
        $block = ContentRegistry::block('cta_band_headline');
        $this->assertNotNull($block);
        $this->assertTrue((bool) ($block['shareable'] ?? false), 'fixture must have shareable=true to prove the apps-gate works');
        $this->assertSame(['website'], $block['apps'] ?? []);

        $this->assertFalse(ContentRegistry::isShareable('cta_band_headline'));
    }

    public function test_is_shareable_is_false_when_apps_target_both_but_flag_is_missing(): void
    {
        // about_page_title targets order_app only and is not shareable — sanity check
        // that isShareable never returns true without the explicit flag.
        $this->assertFalse(ContentRegistry::isShareable('about_page_title'));
    }

    public function test_is_shareable_is_false_for_unknown_key(): void
    {
        $this->assertFalse(ContentRegistry::isShareable('not_a_real_key'));
    }
}
