<?php

declare(strict_types=1);

namespace Tests\Unit\Content;

use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class HeroCarouselMobileCssTest extends TestCase
{
    #[Test]
    public function blade_shows_hero_arrows_on_phones_and_keeps_dots_and_swipe(): void
    {
        $blade = file_get_contents(resource_path('views/home.blade.php'));
        $this->assertIsString($blade);
        $heroPartial = file_get_contents(resource_path('views/partials/home/hero.blade.php'));
        $this->assertIsString($heroPartial);

        // Must NOT hide chevrons on phones.
        $this->assertDoesNotMatchRegularExpression(
            '/@media\s*\(max-width:\s*768px\)\s*\{\s*\.banner-btn\s*\{\s*display:\s*none/',
            $blade,
        );

        // Mobile sizing: ~36px circle, darker translucent bg, inset ~0.65rem.
        $this->assertMatchesRegularExpression(
            '/@media\s*\(max-width:\s*768px\)\s*\{[^}]*\.banner-btn\s*\{[^}]*width:\s*36px/s',
            $blade,
        );
        $this->assertMatchesRegularExpression(
            '/@media\s*\(max-width:\s*768px\)[\s\S]*?\.banner-btn\.prev\s*\{\s*left:\s*0\.65rem/',
            $blade,
        );
        $this->assertMatchesRegularExpression(
            '/@media\s*\(max-width:\s*768px\)[\s\S]*?\.banner-btn\.next\s*\{\s*right:\s*0\.65rem/',
            $blade,
        );
        $this->assertMatchesRegularExpression(
            '/@media\s*\(max-width:\s*768px\)[\s\S]*?\.banner-btn\s*\{[^}]*rgba\(20,\s*14,\s*8,\s*0\.45\)/s',
            $blade,
        );

        // 44px minimum touch target (hit area larger than 36px circle).
        $this->assertMatchesRegularExpression(
            '/\.banner-btn::before[\s\S]*?inset:\s*-4px/',
            $blade,
        );

        $this->assertStringContainsString('.banner-dots', $blade);
        $this->assertStringContainsString('Touch swipe support for mobile', $heroPartial);
        $this->assertMatchesRegularExpression(
            '/@media\s*\(min-width:\s*769px\)[\s\S]*?\.banner-btn\s*\{/',
            $blade,
        );
    }

    #[Test]
    public function order_app_shows_hero_arrows_on_phones_and_desktop(): void
    {
        $cssPath = base_path('../apps/online-order-web/src/index.css');
        $this->assertFileExists($cssPath);
        $css = file_get_contents($cssPath);
        $this->assertIsString($css);

        // Must NOT hide chevrons by default on phones.
        $this->assertDoesNotMatchRegularExpression(
            '/\.home-promo-hero__btn\s*\{[^}]*display:\s*none/s',
            $css,
        );

        $this->assertMatchesRegularExpression(
            '/\.home-promo-hero__btn\s*\{[^}]*display:\s*flex/s',
            $css,
        );
        $this->assertMatchesRegularExpression(
            '/\.home-promo-hero__btn\s*\{[^}]*width:\s*36px/s',
            $css,
        );
        $this->assertMatchesRegularExpression(
            '/\.home-promo-hero__btn\s*\{[^}]*rgba\(20,\s*14,\s*8,\s*0\.45\)/s',
            $css,
        );
        $this->assertMatchesRegularExpression(
            '/\.home-promo-hero__btn--prev\s*\{\s*left:\s*0\.65rem/',
            $css,
        );
        $this->assertMatchesRegularExpression(
            '/\.home-promo-hero__btn--next\s*\{\s*right:\s*0\.65rem/',
            $css,
        );
        $this->assertMatchesRegularExpression(
            '/\.home-promo-hero__btn::before[\s\S]*?inset:\s*-4px/',
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
