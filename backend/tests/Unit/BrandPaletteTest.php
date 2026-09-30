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

    public function test_contrast_picks_higher_wcag_ratio(): void
    {
        $cases = [
            '#D4813A' => BrandPalette::DARK_TEXT,  // current brand, light theme
            '#E09242' => BrandPalette::DARK_TEXT,  // current brand, dark theme
            '#F2C879' => BrandPalette::DARK_TEXT,  // very light
            '#2B1B0F' => BrandPalette::LIGHT_TEXT, // very dark
            '#FFFFFF' => BrandPalette::DARK_TEXT,
            '#000000' => BrandPalette::LIGHT_TEXT,
        ];

        foreach ($cases as $hex => $expected) {
            $palette = BrandPalette::from($hex);
            $this->assertNotNull($palette, "palette for {$hex}");
            $this->assertSame(
                $expected,
                $palette['light']['amber_contrast'],
                "contrast for {$hex}",
            );
        }
    }

    public function test_the_old_amber_keeps_its_dark_text_and_its_dark_theme_shade(): void
    {
        $palette = BrandPalette::from('#D4813A');
        $this->assertNotNull($palette);
        // Choosing the old brand colour must NOT change how it looks.
        $this->assertSame('#1C1408', $palette['light']['amber_contrast']);
        $this->assertSame(BrandPalette::DARK_TEXT, $palette['light']['amber_contrast']);
        $this->assertStringContainsString('--amber-contrast: #1C1408', $palette['css']);
        // One tenth lighter is already readable, so the dark theme stays where it was.
        $this->assertSame('#D88E4E', $palette['dark']['amber']);
    }

    public function test_the_brand_rust_gets_cream_text_and_a_lighter_shade_for_dark_surfaces(): void
    {
        // Owner, 2026-09-30: the logo's rust as the accent. Cream text wins on
        // it (5.2:1 against 3.5:1 for dark text), and on the dark page it has
        // to be lightened two tenths before prices and links pass AA.
        $palette = BrandPalette::from('#B74B0C');
        $this->assertNotNull($palette);
        $this->assertSame(BrandPalette::LIGHT_TEXT, $palette['light']['amber_contrast']);
        $this->assertSame('#C56F3D', $palette['dark']['amber']);
        $this->assertSame('#C56F3D', $palette['light']['amber_on_dark'], 'a dark strip on the light theme uses the same lighter shade');
        $this->assertStringContainsString('--amber-on-dark: #C56F3D', $palette['css']);

        $surface = ['r' => 0x1A, 'g' => 0x12, 'b' => 0x08];
        $this->assertGreaterThanOrEqual(4.5, BrandPalette::contrastRatio($surface, $palette['dark']['amber']));
        $this->assertLessThan(4.5, BrandPalette::contrastRatio($surface, '#B74B0C'), 'the plain rust would not have passed');
    }
}
