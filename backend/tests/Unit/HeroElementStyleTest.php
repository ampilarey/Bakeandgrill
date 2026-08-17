<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Content\HeroSlides;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Hero text styling — owner's feature request, 2026-08-17.
 *
 * "separate outline options for font and the background box also and option to
 *  select outline colors … there is font outline options but when background is
 *  selected cant add font outline and its color is limited … can't select font
 *  color. Need to change normal font color and <em> part font color … more
 *  color options for background."
 *
 * Two structural problems sat behind that. The letter outline was a SHAPE, so
 * choosing a box removed it and the two could never coexist; and every colour
 * came from the single background token, so the outline had no colour of its
 * own and the text could not be coloured at all.
 *
 * The rule that matters most here is the quiet one: anything unset must resolve
 * to null so the renderer omits it and the stylesheet's own value stands. That
 * is what keeps every existing slide looking exactly as it does.
 */
class HeroElementStyleTest extends TestCase
{
    public function test_an_unstyled_element_sets_nothing_at_all(): void
    {
        // No background, no styling: the renderer must emit an empty style
        // attribute, not a pile of defaults that override the stylesheet.
        $this->assertSame('', HeroSlides::elementStyleAttr([], 'title'));
        $this->assertSame([], HeroSlides::elementStyleVars([], 'title'));
    }

    public function test_an_old_slide_keeps_exactly_the_look_it_had(): void
    {
        // A solid colour with no shape drew a letter outline in the background
        // colour. That must survive the outline becoming its own setting.
        $vars = HeroSlides::elementStyleVars(['title_bg' => 'dark'], 'title');

        $this->assertSame(
            ['--hero-el-bg', '--hero-el-outline', '--hero-el-outline-w'],
            array_keys($vars),
            'an untouched slide must not gain any new properties',
        );
        $this->assertSame($vars['--hero-el-bg'], $vars['--hero-el-outline']);
    }

    public function test_a_box_can_now_carry_a_letter_outline_in_its_own_colour(): void
    {
        // The whole point of the request: these were mutually exclusive.
        $style = HeroSlides::resolveElementStyle([
            'title_bg' => 'dark',
            'title_bg_shape' => 'hug',
            'title_outline' => '1',
            'title_outline_color' => '#ff0000',
            'title_border' => '1',
            'title_border_color' => '#00ff00',
        ], 'title');

        $this->assertTrue($style['outline']);
        $this->assertSame('#ff0000', $style['outline_color']);
        $this->assertTrue($style['border']);
        $this->assertSame('#00ff00', $style['border_color']);
        $this->assertNotSame(
            $style['outline_color'],
            $style['border_color'],
            'the letter outline and the box border must be independently coloured',
        );
    }

    public function test_the_outline_can_be_switched_off_over_an_outline_shape(): void
    {
        // The shape implies an outline only while the owner has not said
        // otherwise — an explicit "off" must win.
        $style = HeroSlides::resolveElementStyle(
            ['title_bg' => 'dark', 'title_bg_shape' => 'outline', 'title_outline' => '0'],
            'title',
        );

        $this->assertFalse($style['outline']);
    }

    public function test_text_and_emphasis_take_separate_colours(): void
    {
        $vars = HeroSlides::elementStyleVars(
            ['title_text_color' => '#ffffff', 'title_em_color' => '#f5a623'],
            'title',
        );

        $this->assertSame('#ffffff', $vars['--hero-el-text']);
        $this->assertSame('#f5a623', $vars['--hero-el-em']);
    }

    public function test_a_second_colour_turns_the_fill_into_a_gradient(): void
    {
        $vars = HeroSlides::elementStyleVars(
            ['title_bg' => '#000000', 'title_bg_strength' => 100, 'title_bg_color2' => '#ffffff', 'title_bg_angle' => 90],
            'title',
        );

        $this->assertSame('linear-gradient(90deg, rgba(0,0,0,1), #ffffff)', $vars['--hero-el-bg']);
    }

    public static function junkColorProvider(): array
    {
        // A stored colour goes straight into a style attribute, so anything
        // that is not plainly a colour must be dropped rather than printed.
        return [
            'script' => ['red; background: url(javascript:alert(1))'],
            'closing brace' => ['#fff} .x { display: none'],
            'expression' => ['expression(alert(1))'],
            'url' => ['url(https://evil.test/x.png)'],
            'named colour' => ['red'],
            'four digits' => ['#abcd'],
            'no hash' => ['ffffff'],
            'empty' => [''],
        ];
    }

    #[DataProvider('junkColorProvider')]
    public function test_a_colour_that_is_not_a_colour_is_dropped(string $raw): void
    {
        $style = HeroSlides::resolveElementStyle(['title_text_color' => $raw], 'title');
        $this->assertNull($style['text_color'], "[{$raw}] must not survive into the style attribute");

        if ($raw !== '') {
            $this->assertStringNotContainsString(
                $raw,
                HeroSlides::elementStyleAttr(['title_text_color' => $raw], 'title'),
            );
        }
    }

    public function test_short_hex_and_rgba_are_accepted(): void
    {
        $this->assertSame('#abc', HeroSlides::resolveElementStyle(['title_text_color' => '#ABC'], 'title')['text_color']);
        $this->assertSame(
            'rgba(1,2,3,0.5)',
            HeroSlides::resolveElementStyle(['title_text_color' => 'rgba(1,2,3,0.5)'], 'title')['text_color'],
        );
    }

    public static function clampProvider(): array
    {
        return [
            'scale below floor' => ['title_font_scale', 5, 'font_scale', '0.5'],
            'scale above ceiling' => ['title_font_scale', 9999, 'font_scale', '2'],
            'weight rounds to hundreds' => ['title_font_weight', 733, 'font_weight', 700],
            'weight above ceiling' => ['title_font_weight', 5000, 'font_weight', 900],
            'weight below floor' => ['title_font_weight', -20, 'font_weight', 100],
        ];
    }

    #[DataProvider('clampProvider')]
    public function test_out_of_range_numbers_are_clamped(string $field, mixed $raw, string $out, mixed $expected): void
    {
        $this->assertSame($expected, HeroSlides::resolveElementStyle([$field => $raw], 'title')[$out]);
    }

    public function test_sliders_map_zero_to_one_hundred_onto_a_length(): void
    {
        $min = HeroSlides::resolveElementStyle(['title_bg_radius' => 0], 'title')['radius'];
        $max = HeroSlides::resolveElementStyle(['title_bg_radius' => 100], 'title')['radius'];

        $this->assertSame('0px', $min);
        $this->assertSame('40px', $max);
    }

    public function test_a_non_numeric_slider_value_falls_back_rather_than_breaking_the_slide(): void
    {
        $style = HeroSlides::resolveElementStyle(['title_bg_radius' => 'wide', 'title_font_scale' => 'big'], 'title');

        $this->assertNull($style['radius']);
        $this->assertNull($style['font_scale']);
    }

    public static function alignProvider(): array
    {
        return [
            'default' => [[], 'center'],
            'left' => [['text_align' => 'left'], 'left'],
            'right' => [['text_align' => 'RIGHT'], 'right'],
            'padded' => [['text_align' => '  left '], 'left'],
            'nonsense' => [['text_align' => 'diagonal'], 'center'],
        ];
    }

    #[DataProvider('alignProvider')]
    public function test_text_alignment_resolves_and_falls_back(array $slide, string $expected): void
    {
        $this->assertSame($expected, HeroSlides::resolveTextAlign($slide));
    }

    public function test_style_is_only_offered_for_the_heading_and_subheading(): void
    {
        // Eyebrow and CTAs are small pills with their own styling rules.
        $this->assertSame(['title', 'subtitle'], HeroSlides::STYLED_KEYS);
        $this->assertArrayHasKey('title', HeroSlides::presentation([])['styles']);
        $this->assertArrayNotHasKey('eyebrow', HeroSlides::presentation([])['styles']);
    }
}
