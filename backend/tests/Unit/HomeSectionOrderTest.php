<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Content\HomeSectionOrder;
use PHPUnit\Framework\TestCase;

class HomeSectionOrderTest extends TestCase
{
    public function test_resolve_ignores_unknown_and_appends_missing_defaults(): void
    {
        $this->assertSame(
            ['cta', 'specials', 'featured', 'categories', 'proof', 'location'],
            HomeSectionOrder::resolve('["cta","unknown","specials"]'),
        );
    }

    public function test_resolve_deduplicates_and_falls_back_to_default_for_invalid_json(): void
    {
        $this->assertSame(
            ['categories', 'specials', 'featured', 'proof', 'cta', 'location'],
            HomeSectionOrder::resolve('["categories","categories","bogus"]'),
        );

        $this->assertSame(HomeSectionOrder::DEFAULT, HomeSectionOrder::resolve('{nope'));
    }

    public function test_enable_key_for_known_sections(): void
    {
        $this->assertSame('section_specials_enabled', HomeSectionOrder::enableKeyFor('specials'));
        $this->assertSame('section_cta_enabled', HomeSectionOrder::enableKeyFor('cta'));
        $this->assertNull(HomeSectionOrder::enableKeyFor('unknown'));
    }
}
