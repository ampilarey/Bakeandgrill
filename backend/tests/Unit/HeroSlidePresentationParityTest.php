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
}
