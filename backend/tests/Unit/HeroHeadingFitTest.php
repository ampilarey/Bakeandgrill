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

    public function test_plain_slide_is_not_panelled(): void
    {
        $pres = HeroSlides::presentation(['photo_brightness' => 60, 'text_background' => 70]);

        $this->assertFalse($pres['panelled']);
    }

    public static function panelProvider(): array
    {
        return [
            'title glass' => [['title_bg' => 'glass']],
            'title solid' => [['title_bg' => 'dark']],
            'subtitle glass' => [['subtitle_bg' => 'glass']],
            'subtitle solid' => [['subtitle_bg' => 'light']],
            'both' => [['title_bg' => 'glass', 'subtitle_bg' => 'dark']],
        ];
    }

    #[DataProvider('panelProvider')]
    public function test_a_heading_or_subheading_panel_marks_the_slide_panelled(array $slide): void
    {
        $pres = HeroSlides::presentation($slide);

        $this->assertTrue(
            $pres['panelled'],
            'a panel on the heading or subheading must switch the whole-block gradient off',
        );
    }

    public function test_transparent_is_not_a_panel(): void
    {
        // "none" resolves to transparent — there is no box to nest, so the
        // gradient must stay. Otherwise choosing "no background" would silently
        // strip the readability scrim as well.
        $pres = HeroSlides::presentation(['title_bg' => 'none']);

        $this->assertSame('transparent', $pres['elements']['title']['css']);
        $this->assertFalse($pres['panelled']);
    }

    public function test_a_panel_on_eyebrow_or_cta_alone_does_not_strip_the_gradient(): void
    {
        // Only the heading and subheading sit inside the copy block as large
        // boxes. A pill on the eyebrow or a CTA button is not a nested panel.
        foreach (['eyebrow_bg', 'cta1_bg', 'cta2_bg'] as $key) {
            $pres = HeroSlides::presentation([$key => 'glass']);
            $this->assertFalse($pres['panelled'], "[{$key}] must not strip the copy gradient");
        }
    }
}
