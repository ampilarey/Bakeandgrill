<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Content\HeroSlides;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Website Blade and order-app CSS must stay in lockstep for the same slide.
 */
class HeroSlidePresentationParityTest extends TestCase
{
    public static function slideProvider(): array
    {
        return [
            'legacy dim 0' => [['dim' => 0], 1.0, 0.0, 'bottom'],
            'legacy dim 50' => [['dim' => 50], 0.5, 0.5, 'bottom'],
            'legacy dim 100' => [['dim' => 100], 0.0, 1.0, 'bottom'],
            'bright + strong' => [
                ['photo_brightness' => 100, 'text_background' => 100],
                1.0,
                1.0,
                'bottom',
            ],
            'text top' => [
                ['photo_brightness' => 80, 'text_background' => 90, 'text_position' => 'top'],
                0.8,
                0.9,
                'top',
            ],
            'title panel dark 50' => [
                [
                    'photo_brightness' => 100,
                    'text_background' => 40,
                    'title_bg' => 'dark',
                    'title_bg_strength' => 50,
                ],
                1.0,
                0.4,
                'bottom',
            ],
        ];
    }

    #[DataProvider('slideProvider')]
    public function test_presentation_matches_order_app_contract(
        array $slide,
        float $photo,
        float $scrim,
        string $position,
    ): void {
        $resolved = HeroSlides::presentation($slide);
        $this->assertEqualsWithDelta($photo, $resolved['photo'], 0.0001);
        $this->assertEqualsWithDelta($scrim, $resolved['scrim'], 0.0001);
        $this->assertSame($position, $resolved['text_position']);

        // Mobile opacity formula shared with order-app heroMediaOpacityMobile()
        $opacity = 0.45 + 0.55 * $resolved['photo'];
        if (isset($slide['dim']) && ! isset($slide['photo_brightness'])) {
            $legacy = 1 - 0.55 * (((float) $slide['dim']) / 100);
            $this->assertEqualsWithDelta($legacy, $opacity, 0.0001);
        }

        // Element CSS must match the order-app resolver contract for the same keys.
        if (isset($slide['title_bg'])) {
            $this->assertSame('rgba(28,20,8,0.5)', $resolved['elements']['title']['css']);
        } else {
            $this->assertNull($resolved['elements']['title']['css']);
        }
    }

    public function test_blade_and_order_css_use_split_vars_not_hero_dim(): void
    {
        $blade = file_get_contents(resource_path('views/home.blade.php')) ?: '';
        $orderCss = file_get_contents(base_path('../apps/online-order-web/src/index.css')) ?: '';

        $this->assertStringContainsString('--hero-photo', $blade);
        $this->assertStringContainsString('--hero-scrim', $blade);
        $this->assertStringNotContainsString('--hero-dim', $blade);

        $this->assertStringContainsString('--hero-photo', $orderCss);
        $this->assertStringContainsString('--hero-scrim', $orderCss);
        $this->assertStringNotContainsString('--hero-dim', $orderCss);

        // Same mobile opacity expression in both (whitespace-tolerant).
        $this->assertMatchesRegularExpression(
            '/opacity:\s*calc\(0\.45\s*\+\s*0\.55\s*\*\s*var\(--hero-photo/',
            $blade,
        );
        $this->assertMatchesRegularExpression(
            '/opacity:\s*calc\(0\.45\s*\+\s*0\.55\s*\*\s*var\(--hero-photo/',
            $orderCss,
        );
    }

    /**
     * §7.1 — text background must paint the copy panel, not the full-bleed overlay.
     * Website and order app must agree.
     */
    public function test_scrim_is_on_copy_panel_not_full_bleed_overlay(): void
    {
        $blade = file_get_contents(resource_path('views/home.blade.php')) ?: '';
        $orderCss = file_get_contents(base_path('../apps/online-order-web/src/index.css')) ?: '';
        $heroPartial = file_get_contents(resource_path('views/partials/home/hero.blade.php')) ?: '';
        $promo = file_get_contents(base_path('../apps/online-order-web/src/components/home/PromoCarousel.tsx')) ?: '';

        // Overlay itself must not carry the --hero-scrim gradient (any viewport).
        $this->assertDoesNotMatchRegularExpression(
            '/\.banner-overlay\s*\{[^}]*--hero-scrim/s',
            $blade,
        );
        $this->assertDoesNotMatchRegularExpression(
            '/\.home-promo-hero__overlay\s*\{[^}]*--hero-scrim/s',
            $orderCss,
        );
        $this->assertSame(0, preg_match_all('/\.banner-overlay\s*\{[^}]*--hero-scrim/s', $blade));
        $this->assertSame(0, preg_match_all('/\.home-promo-hero__overlay\s*\{[^}]*--hero-scrim/s', $orderCss));

        // Copy panel owns the scrim gradient in both apps.
        $this->assertMatchesRegularExpression(
            '/\.banner-copy\s*\{[^}]*--hero-scrim/s',
            $blade,
        );
        $this->assertMatchesRegularExpression(
            '/\.home-promo-hero__copy\s*\{[^}]*--hero-scrim/s',
            $orderCss,
        );

        // Markup wraps text in the copy panel on both surfaces.
        $this->assertStringContainsString('banner-copy', $heroPartial);
        $this->assertStringContainsString('home-promo-hero__copy', $promo);
    }

    /**
     * Same slide → same treatment on website (PHP) and order-app (TS contract).
     */
    public function test_website_and_order_app_same_treatment_for_same_slide(): void
    {
        $slide = [
            'photo_brightness' => 100,
            'text_background' => 80,
            'text_position' => 'middle',
            'title_bg' => 'dark',
            'title_bg_strength' => 60,
            'eyebrow_bg' => 'amber',
            'eyebrow_bg_strength' => 22,
            'show_from' => '2026-01-01',
            'show_until' => '2026-12-31',
        ];

        $php = HeroSlides::presentation($slide);

        // Mirror of resolveHeroSlidePresentation in both TS apps — keep this list
        // in lockstep with apps/*/src/utils/heroSlidePresentation.ts
        $this->assertEqualsWithDelta(1.0, $php['photo'], 0.0001);
        $this->assertEqualsWithDelta(0.8, $php['scrim'], 0.0001);
        $this->assertSame('middle', $php['text_position']);
        $this->assertSame('rgba(28,20,8,0.6)', $php['elements']['title']['css']);
        $this->assertSame('rgba(212,129,58,0.22)', $php['elements']['eyebrow']['css']);
        $this->assertNull($php['elements']['subtitle']['css']);
        $this->assertNull($php['elements']['cta1']['css']);
        $this->assertNull($php['elements']['cta2']['css']);

        $orderTs = file_get_contents(base_path('../apps/online-order-web/src/utils/heroSlidePresentation.ts')) ?: '';
        $adminTs = file_get_contents(base_path('../apps/admin-dashboard/src/utils/heroSlidePresentation.ts')) ?: '';
        foreach (['HERO_BG_TOKEN_RGB', 'resolveHeroSlidePresentation', 'isHeroSlideInScheduleWindow', "dark: '28,20,8'"] as $needle) {
            $this->assertStringContainsString($needle, $orderTs);
            $this->assertStringContainsString($needle, $adminTs);
        }
    }
}
