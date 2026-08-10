<?php

declare(strict_types=1);

namespace Tests\Unit\Content;

use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Hero carousel: phones are swipe + dots only; desktop keeps chevrons.
 */
class HeroCarouselMobileCssTest extends TestCase
{
    #[Test]
    public function blade_hides_hero_arrows_on_phones_and_keeps_dots_and_swipe(): void
    {
        $blade = file_get_contents(resource_path('views/home.blade.php'));
        $this->assertIsString($blade);
        $heroPartial = file_get_contents(resource_path('views/partials/home/hero.blade.php'));
        $this->assertIsString($heroPartial);

        // Phones: chevrons hidden — swipe + dots only.
        $this->assertMatchesRegularExpression(
            '/@media\s*\(max-width:\s*768px\)\s*\{\s*\.banner-btn\s*\{\s*display:\s*none/',
            $blade,
        );

        // Must not reintroduce the temporary "visible on phones" sizing block.
        $this->assertDoesNotMatchRegularExpression(
            '/@media\s*\(max-width:\s*768px\)\s*\{[^}]*\.banner-btn\s*\{[^}]*width:\s*36px/s',
            $blade,
        );

        // Desktop base rules unchanged (48px, 1.5rem inset).
        $this->assertMatchesRegularExpression(
            '/\.banner-btn\s*\{[^}]*width:\s*48px/s',
            $blade,
        );
        $this->assertMatchesRegularExpression(
            '/\.banner-btn\.prev\s*\{\s*left:\s*1\.5rem/',
            $blade,
        );
        $this->assertMatchesRegularExpression(
            '/\.banner-btn\.next\s*\{\s*right:\s*1\.5rem/',
            $blade,
        );

        // Dots stay as the phone navigation control; real buttons + swipe.
        $this->assertStringContainsString('.banner-dots', $blade);
        $this->assertMatchesRegularExpression(
            '/<button[^>]*class="banner-dot/',
            $heroPartial,
        );
        $this->assertStringContainsString('Touch swipe support for mobile', $heroPartial);
        $this->assertMatchesRegularExpression(
            '/@media\s*\(min-width:\s*769px\)[\s\S]*?\.banner-btn\s*\{/',
            $blade,
        );
    }

    #[Test]
    public function order_app_hides_hero_arrows_on_phones_shows_on_desktop(): void
    {
        $cssPath = base_path('../apps/online-order-web/src/index.css');
        $this->assertFileExists($cssPath);
        $css = file_get_contents($cssPath);
        $this->assertIsString($css);

        // Default (phones): chevrons hidden.
        $this->assertMatchesRegularExpression(
            '/\.home-promo-hero__btn\s*\{[^}]*display:\s*none/s',
            $css,
        );

        // Desktop: shown as flex with the existing desktop sizing.
        $this->assertMatchesRegularExpression(
            '/@media\s*\(min-width:\s*769px\)[\s\S]*?\.home-promo-hero__btn\s*\{[^}]*display:\s*flex/s',
            $css,
        );
        $this->assertMatchesRegularExpression(
            '/@media\s*\(min-width:\s*769px\)[\s\S]*?\.home-promo-hero__btn\s*\{[^}]*width:\s*52px/s',
            $css,
        );

        // Dots remain on phones.
        $this->assertMatchesRegularExpression(
            '/@media\s*\(max-width:\s*768px\)[\s\S]*?\.home-promo-hero__dots/',
            $css,
        );
        $this->assertStringContainsString('.home-promo-hero__dot', $css);
    }
}
