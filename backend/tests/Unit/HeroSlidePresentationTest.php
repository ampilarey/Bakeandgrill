<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Content\HeroSlides;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * §2.1 / §2.2 — photo brightness, text background, text position.
 * Legacy `dim` must map so rendered CSS vars match the pre-split look.
 */
class HeroSlidePresentationTest extends TestCase
{
    public static function legacyDimProvider(): array
    {
        return [
            'dim 0' => [0, 1.0, 0.0],
            'dim 50' => [50, 0.5, 0.5],
            'dim 100' => [100, 0.0, 1.0],
        ];
    }

    #[DataProvider('legacyDimProvider')]
    public function test_legacy_dim_maps_to_identical_css_factors(int $dim, float $photo, float $scrim): void
    {
        $resolved = HeroSlides::presentation(['dim' => $dim, 'title' => 'T', 'image' => '/a.jpg']);

        $this->assertEqualsWithDelta($photo, $resolved['photo'], 0.0001);
        $this->assertEqualsWithDelta($scrim, $resolved['scrim'], 0.0001);
        // Old mobile opacity formula: 1 - 0.55 * (dim/100)
        $legacyOpacity = 1 - 0.55 * ($dim / 100);
        $newOpacity = 0.45 + 0.55 * $resolved['photo'];
        $this->assertEqualsWithDelta($legacyOpacity, $newOpacity, 0.0001);
        $this->assertSame('bottom', $resolved['text_position']);
    }

    public function test_photo_and_scrim_are_independent(): void
    {
        $brightStrong = HeroSlides::presentation([
            'photo_brightness' => 100,
            'text_background' => 100,
            'title' => 'T',
            'image' => '/a.jpg',
        ]);
        $this->assertEqualsWithDelta(1.0, $brightStrong['photo'], 0.0001);
        $this->assertEqualsWithDelta(1.0, $brightStrong['scrim'], 0.0001);
        // Impossible under single dim: dim would need to be 0 and 100 at once.
        $this->assertGreaterThan(0.9, 0.45 + 0.55 * $brightStrong['photo']);
        $this->assertGreaterThan(0.9, $brightStrong['scrim']);
    }

    public function test_text_position_defaults_bottom_and_accepts_top_middle(): void
    {
        $this->assertSame('bottom', HeroSlides::presentation(['title' => 'T'])['text_position']);
        $this->assertSame('top', HeroSlides::presentation(['text_position' => 'top', 'title' => 'T'])['text_position']);
        $this->assertSame('middle', HeroSlides::presentation(['text_position' => 'middle', 'title' => 'T'])['text_position']);
        $this->assertSame('bottom', HeroSlides::presentation(['text_position' => 'nope', 'title' => 'T'])['text_position']);
    }

    public function test_absent_fields_match_legacy_dim_100(): void
    {
        // Slides that never stored dim used dim??100 — keep that look.
        $resolved = HeroSlides::presentation(['title' => 'T', 'image' => '/a.jpg']);
        $this->assertEqualsWithDelta(0.0, $resolved['photo'], 0.0001);
        $this->assertEqualsWithDelta(1.0, $resolved['scrim'], 0.0001);
    }

    public function test_explicit_fields_win_over_legacy_dim(): void
    {
        $resolved = HeroSlides::presentation([
            'dim' => 100,
            'photo_brightness' => 100,
            'text_background' => 40,
            'title' => 'T',
        ]);
        $this->assertEqualsWithDelta(1.0, $resolved['photo'], 0.0001);
        $this->assertEqualsWithDelta(0.4, $resolved['scrim'], 0.0001);
    }
}
