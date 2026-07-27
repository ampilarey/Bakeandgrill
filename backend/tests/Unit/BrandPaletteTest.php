<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Content\BrandPalette;
use PHPUnit\Framework\TestCase;

class BrandPaletteTest extends TestCase
{
    public function test_invalid_or_empty_returns_null(): void
    {
        $this->assertNull(BrandPalette::from(null));
        $this->assertNull(BrandPalette::from(''));
        $this->assertNull(BrandPalette::from('not-a-colour'));
        $this->assertNull(BrandPalette::from('D4813A'));
    }

    public function test_derives_four_tokens_for_both_themes(): void
    {
        $palette = BrandPalette::from('#D4813A');
        $this->assertNotNull($palette);
        $this->assertSame('#D4813A', $palette['light']['amber']);
        $this->assertNotSame($palette['light']['amber'], $palette['light']['amber_hover']);
        $this->assertStringStartsWith('rgba(', $palette['light']['amber_glow']);
        $this->assertNotSame($palette['light']['amber'], $palette['dark']['amber']);
        $this->assertStringContainsString('--amber:', $palette['css']);
        $this->assertStringContainsString('--amber-hover:', $palette['css']);
        $this->assertStringContainsString('--amber-light:', $palette['css']);
        $this->assertStringContainsString('--amber-glow:', $palette['css']);
        $this->assertStringContainsString('[data-theme="dark"]', $palette['css']);
    }

    public function test_contrast_flips_for_light_vs_dark_brand_colour(): void
    {
        $light = BrandPalette::from('#F2C879');
        $dark = BrandPalette::from('#2B1B0F');
        $this->assertNotNull($light);
        $this->assertNotNull($dark);
        $this->assertSame(BrandPalette::DARK_TEXT, $light['light']['amber_contrast']);
        $this->assertSame(BrandPalette::LIGHT_TEXT, $dark['light']['amber_contrast']);
        $this->assertStringContainsString('--amber-contrast:', $light['css']);
    }
}
