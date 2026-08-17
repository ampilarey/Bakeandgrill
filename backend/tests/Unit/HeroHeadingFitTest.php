<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Content\HeroSlides;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Hero heading fit — owner audit, 2026-08-16.
 *
 * Measured in a real browser at 320px: a four-line heading made the copy panel
 * 394px tall inside a 360px banner, so it started 78px ABOVE the banner and was
 * clipped by .hero-banner{overflow:hidden}. The open/closed badge then sat on
 * top of the heading. Owner chose "words shrink to fit the banner" over
 * "banner grows", and "turn the whole-block gradient off when the heading has
 * its own panel".
 *
 * These two decisions are data, resolved here and mirrored in TypeScript by
 * heroSlidePresentation.ts. The CSS that consumes them is asserted against a
 * real layout engine in e2e/tests/go-live/09c-hero-fit.spec.ts.
 */
class HeroHeadingFitTest extends TestCase
{
    public static function bandProvider(): array
    {
        return [
            'empty' => ['', ''],
            'short' => ['Bake & Grill', ''],
            'exactly 26' => [str_repeat('a', 26), ''],
            'just over 26' => [str_repeat('a', 27), 'long'],
            'exactly 46' => [str_repeat('a', 46), 'long'],
            'just over 46' => [str_repeat('a', 47), 'xlong'],
            'the reported four-liner' => [
                'Dhivehi Breakfast and Artisan Baking',
                'long',
            ],
        ];
    }

    #[DataProvider('bandProvider')]
    public function test_heading_length_band_steps_on_plain_text_length(string $html, string $expected): void
    {
        $this->assertSame($expected, HeroSlides::headingLengthBand($html));
    }

    public function test_markup_does_not_count_towards_the_length(): void
    {
        // Same eleven visible characters, wildly different markup weight.
        $plain = HeroSlides::headingLengthBand('Bake Grill');
        $rich = HeroSlides::headingLengthBand('<em><strong>Bake</strong></em> <span>Grill</span>');

        $this->assertSame('', $plain);
        $this->assertSame($rich, $plain, 'markup must not push a short heading into a smaller band');
    }

    public function test_line_breaks_count_as_a_space_not_as_content(): void
    {
        $this->assertSame(
            HeroSlides::headingLengthBand('Bake and Grill Maldives Malé'),
            HeroSlides::headingLengthBand('Bake and Grill<br>Maldives Malé'),
        );
    }

    public function test_entities_do_not_inflate_the_length(): void
    {
        // &amp; is one visible character, not five.
        $this->assertSame('', HeroSlides::headingLengthBand('Bake &amp; Grill Mal&eacute;'));
    }

    public function test_plain_slide_is_not_panelled_and_keeps_its_shade(): void
    {
        $pres = HeroSlides::presentation(['photo_brightness' => 60, 'text_background' => 70]);

        $this->assertFalse($pres['panelled']);
        $this->assertTrue($pres['copy_scrim']);
    }

    public static function panelProvider(): array
    {
        return [
            'title glass' => [['title_bg' => 'glass']],
            'title solid box' => [['title_bg' => 'dark', 'title_bg_shape' => 'hug']],
            'subtitle glass' => [['subtitle_bg' => 'glass']],
            'subtitle solid box' => [['subtitle_bg' => 'light', 'subtitle_bg_shape' => 'full']],
            'both' => [['title_bg' => 'glass', 'subtitle_bg' => 'dark', 'subtitle_bg_shape' => 'line']],
        ];
    }

    #[DataProvider('panelProvider')]
    public function test_a_heading_or_subheading_panel_marks_the_slide_panelled(array $slide): void
    {
        $pres = HeroSlides::presentation($slide);

        $this->assertTrue($pres['panelled']);
        $this->assertFalse(
            $pres['copy_scrim'],
            'on auto, a panel on the heading or subheading must switch the whole-block shade off',
        );
    }

    public function test_the_outline_shape_is_not_a_panel(): void
    {
        // A letter outline paints no box, so there is nothing for the block
        // shade to nest inside and it must stay.
        $pres = HeroSlides::presentation(['title_bg' => 'dark']);

        $this->assertSame('outline', $pres['elements']['title']['shape']);
        $this->assertFalse($pres['panelled']);
        $this->assertTrue($pres['copy_scrim']);
    }

    public function test_transparent_is_not_a_panel(): void
    {
        // "none" resolves to transparent — there is no box to nest, so the
        // gradient must stay. Otherwise choosing "no background" would silently
        // strip the readability scrim as well.
        $pres = HeroSlides::presentation(['title_bg' => 'none']);

        $this->assertSame('transparent', $pres['elements']['title']['css']);
        $this->assertFalse($pres['panelled']);
        $this->assertTrue($pres['copy_scrim']);
    }

    public function test_a_panel_on_eyebrow_or_cta_alone_does_not_strip_the_gradient(): void
    {
        // Only the heading and subheading sit inside the copy block as large
        // boxes. A pill on the eyebrow or a CTA button is not a nested panel.
        foreach (['eyebrow_bg', 'cta1_bg', 'cta2_bg'] as $key) {
            $pres = HeroSlides::presentation([$key => 'glass']);
            $this->assertFalse($pres['panelled'], "[{$key}] must not strip the copy gradient");
            $this->assertTrue($pres['copy_scrim'], "[{$key}] must not strip the copy gradient");
        }
    }

    public function test_default_mode_is_auto(): void
    {
        $this->assertSame('auto', HeroSlides::presentation([])['copy_scrim_mode']);
    }

    public function test_always_forces_the_shade_back_over_a_panel(): void
    {
        // The owner wanted to drive this themselves (2026-08-17), so "Always"
        // must beat the automatic rule, not merely lose to it.
        $pres = HeroSlides::presentation(['title_bg' => 'glass', 'copy_scrim_mode' => 'always']);

        $this->assertTrue($pres['panelled']);
        $this->assertTrue($pres['copy_scrim']);
    }

    public function test_off_removes_the_shade_even_without_a_panel(): void
    {
        $pres = HeroSlides::presentation(['text_background' => 100, 'copy_scrim_mode' => 'off']);

        $this->assertFalse($pres['panelled']);
        $this->assertFalse($pres['copy_scrim']);
    }

    public function test_unknown_or_messy_mode_falls_back_to_auto(): void
    {
        foreach (['', 'nonsense', null, '  AUTO  ', 'Always'] as $raw) {
            $pres = HeroSlides::presentation(['copy_scrim_mode' => $raw]);
            $this->assertContains($pres['copy_scrim_mode'], ['auto', 'always']);
        }

        // Casing and padding are tolerated rather than silently discarded.
        $this->assertSame('always', HeroSlides::presentation(['copy_scrim_mode' => '  Always '])['copy_scrim_mode']);
        $this->assertSame('auto', HeroSlides::presentation(['copy_scrim_mode' => 'nonsense'])['copy_scrim_mode']);
    }

    public static function shapeBackCompatProvider(): array
    {
        // Nothing stored: the shape the slide has always drawn, so upgrading
        // changes nothing on screen.
        return [
            'glass, no flag → one box' => [['title_bg' => 'glass'], 'hug'],
            'solid, no flag → outline' => [['title_bg' => 'dark'], 'outline'],
            'custom hex, no flag → outline' => [['title_bg' => '#123456'], 'outline'],
            'solid + full flag → bar' => [['title_bg' => 'dark', 'title_bg_full_width' => true], 'full'],
            'glass + full flag → bar' => [['title_bg' => 'glass', 'title_bg_full_width' => true], 'full'],
            'stored shape wins over the flag' => [
                ['title_bg' => 'dark', 'title_bg_full_width' => true, 'title_bg_shape' => 'line'],
                'line',
            ],
            'messy stored shape' => [['title_bg' => 'dark', 'title_bg_shape' => '  LINE '], 'line'],
            'unknown stored shape falls back' => [['title_bg' => 'glass', 'title_bg_shape' => 'wat'], 'hug'],
        ];
    }

    #[DataProvider('shapeBackCompatProvider')]
    public function test_element_shape_preserves_the_existing_look(array $slide, string $expected): void
    {
        $this->assertSame($expected, HeroSlides::resolveElementBackground($slide, 'title')['shape']);
    }

    public function test_per_line_is_available_to_the_subheading_too(): void
    {
        $pres = HeroSlides::presentation(['subtitle_bg' => 'dark', 'subtitle_bg_shape' => 'line']);

        $this->assertSame('line', $pres['elements']['subtitle']['shape']);
    }

    public function test_shape_is_a_heading_and_subheading_concept_only(): void
    {
        // Eyebrow and CTAs are single-line pills; there is no line to split.
        foreach (['eyebrow', 'cta1', 'cta2'] as $key) {
            $shape = HeroSlides::resolveElementBackground([$key.'_bg' => 'glass'], $key)['shape'];
            $this->assertSame('hug', $shape, "[{$key}] must not take a per-line shape");
        }
    }

    public function test_a_per_line_heading_still_counts_as_a_panel(): void
    {
        // Small boxes are still boxes — the block shade would sit behind them.
        $pres = HeroSlides::presentation(['title_bg' => 'dark', 'title_bg_shape' => 'line']);

        $this->assertTrue($pres['panelled']);
        $this->assertFalse($pres['copy_scrim']);
    }
}
