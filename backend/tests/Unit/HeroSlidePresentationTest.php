<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Content\HeroSlides;
use Carbon\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * §2.1 / §2.2 / §7 — photo brightness, text background, element panels, dates.
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

    public function test_absent_element_bg_means_hardcoded_default(): void
    {
        $resolved = HeroSlides::presentation(['title' => 'T', 'image' => '/a.jpg']);
        foreach (HeroSlides::ELEMENT_KEYS as $key) {
            $this->assertNull($resolved['elements'][$key]['css'], $key);
            $this->assertNull($resolved['elements'][$key]['token'], $key);
        }
    }

    public function test_element_bg_token_and_strength(): void
    {
        $resolved = HeroSlides::presentation([
            'title' => 'T',
            'title_bg' => 'dark',
            'title_bg_strength' => 50,
            'title_bg_full_width' => false,
        ]);
        $this->assertSame('dark', $resolved['elements']['title']['token']);
        $this->assertSame(50, $resolved['elements']['title']['strength']);
        $this->assertFalse($resolved['elements']['title']['full_width']);
        $this->assertSame('rgba(28,20,8,0.5)', $resolved['elements']['title']['css']);
    }

    public function test_split_rich_text_lines_on_br(): void
    {
        $this->assertSame(
            ['Where Dhivehi breakfast', '<em>meets</em> baking'],
            HeroSlides::splitRichTextLines('Where Dhivehi breakfast<br><em>meets</em> baking'),
        );
        $this->assertSame(
            ['One line'],
            HeroSlides::splitRichTextLines('One line'),
        );
        $this->assertSame(
            ['A', 'B'],
            HeroSlides::splitRichTextLines('A<br/>B<br>'),
        );
    }

    public function test_element_bg_none_is_transparent(): void
    {
        $resolved = HeroSlides::presentation([
            'eyebrow' => 'X',
            'eyebrow_bg' => 'none',
        ]);
        $this->assertSame('transparent', $resolved['elements']['eyebrow']['css']);
    }

    public function test_real_stored_slide_without_element_fields_keeps_null_css(): void
    {
        // Shape of a live slide after §2.1 ship — no per-element keys.
        $slide = [
            'image' => '/storage/hero/shop.jpg',
            'title' => 'Dhivehi breakfast<br>meets <em>artisan baking</em>',
            'subtitle' => 'Real food. Proper char.',
            'eyebrow' => "Malé's neighbourhood café",
            'cta_text' => 'Order Now →',
            'cta_url' => '/order/',
            'cta2_text' => 'View Menu',
            'cta2_url' => '/menu',
            'photo_brightness' => 100,
            'text_background' => 100,
            'text_position' => 'bottom',
            'showing' => true,
        ];
        $resolved = HeroSlides::presentation($slide);
        $this->assertEqualsWithDelta(1.0, $resolved['photo'], 0.0001);
        $this->assertEqualsWithDelta(1.0, $resolved['scrim'], 0.0001);
        foreach (HeroSlides::ELEMENT_KEYS as $key) {
            $this->assertNull($resolved['elements'][$key]['css']);
        }
    }

    public function test_schedule_window_both_empty_always_shows(): void
    {
        $this->assertTrue(HeroSlides::isSlideInScheduleWindow(['title' => 'T']));
        $this->assertTrue(HeroSlides::isRenderableSlide(['title' => 'T', 'image' => '/a.jpg']));
    }

    public function test_showing_false_wins_over_dates(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-15 12:00:00', 'Indian/Maldives'));
        $slide = [
            'title' => 'T',
            'image' => '/a.jpg',
            'showing' => false,
            'show_from' => '2026-01-01',
            'show_until' => '2026-12-31',
        ];
        $this->assertFalse(HeroSlides::isRenderableSlide($slide));
        Carbon::setTestNow();
    }

    public function test_schedule_window_uses_restaurant_timezone(): void
    {
        // 2026-03-20 23:00 UTC = 2026-03-21 04:00 Maldives (UTC+5)
        Carbon::setTestNow(Carbon::parse('2026-03-20 23:00:00', 'UTC'));
        $slide = [
            'title' => 'T',
            'image' => '/a.jpg',
            'show_until' => '2026-03-20', // end of 20 Mar Maldives
        ];
        // Now in Maldives is 21 Mar 04:00 → past until → hidden
        $this->assertFalse(HeroSlides::isSlideInScheduleWindow($slide));
        $this->assertFalse(HeroSlides::isRenderableSlide($slide));

        Carbon::setTestNow(Carbon::parse('2026-03-20 10:00:00', 'Indian/Maldives'));
        $this->assertTrue(HeroSlides::isSlideInScheduleWindow($slide));
        Carbon::setTestNow();
    }

    public function test_show_from_hides_before_start(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-02-01 12:00:00', 'Indian/Maldives'));
        $slide = [
            'title' => 'Ramadan',
            'image' => '/a.jpg',
            'show_from' => '2026-03-01',
        ];
        $this->assertFalse(HeroSlides::isRenderableSlide($slide));
        Carbon::setTestNow(Carbon::parse('2026-03-02 12:00:00', 'Indian/Maldives'));
        $this->assertTrue(HeroSlides::isRenderableSlide($slide));
        Carbon::setTestNow();
    }
}
