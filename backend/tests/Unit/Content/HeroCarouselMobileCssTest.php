<?php

declare(strict_types=1);

namespace Tests\Unit\Content;

use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class HeroCarouselMobileCssTest extends TestCase
{
    #[Test]
    public function blade_hides_hero_arrows_on_phones_and_keeps_dots_and_swipe(): void
    {
        $blade = file_get_contents(resource_path('views/home.blade.php'));
        $this->assertIsString($blade);
        $heroPartial = file_get_contents(resource_path('views/partials/home/hero.blade.php'));
        $this->assertIsString($heroPartial);

        $this->assertMatchesRegularExpression(
            '/@media\s*\(max-width:\s*768px\)\s*\{\s*\.banner-btn\s*\{\s*display:\s*none/',
            $blade,
        );
        $this->assertStringContainsString('.banner-dots', $blade);
        // Swipe JS lives with the hero block partial (page_blocks render path).
        $this->assertStringContainsString('Touch swipe support for mobile', $heroPartial);
        $this->assertMatchesRegularExpression(
            '/@media\s*\(min-width:\s*769px\)[\s\S]*?\.banner-btn\s*\{/',
            $blade,
        );
    }

    #[Test]
    public function order_app_hides_hero_arrows_on_phones_and_shows_them_on_desktop(): void
    {
        $cssPath = base_path('../apps/online-order-web/src/index.css');
        $this->assertFileExists($cssPath);
        $css = file_get_contents($cssPath);
        $this->assertIsString($css);

        $this->assertMatchesRegularExpression(
            '/\.home-promo-hero__btn\s*\{[^}]*display:\s*none/s',
            $css,
        );
        $this->assertMatchesRegularExpression(
            '/@media\s*\(min-width:\s*769px\)[\s\S]*?\.home-promo-hero__btn\s*\{[^}]*display:\s*flex/s',
            $css,
        );
        $this->assertMatchesRegularExpression(
            '/@media\s*\(max-width:\s*768px\)[\s\S]*?\.home-promo-hero__dots/',
            $css,
        );
        $this->assertStringContainsString('.home-promo-hero__dot', $css);
    }
}
