<?php

declare(strict_types=1);

namespace Tests\Unit\Posters;

use App\Domains\Posters\BrandCmyk;
use App\Domains\Posters\LogoVector;
use App\Domains\Posters\SvgPath;
use Tests\TestCase;

/**
 * The logo "way (a)" of docs/POSTER_PLAN.md § 6.4: the animated SVG's
 * paths redrawn as CMYK fills, gradients and glow flattened to brand inks.
 */
class LogoVectorTest extends TestCase
{
    private function logo(): LogoVector
    {
        return LogoVector::fromFile(public_path('brand/logo-animated.svg'));
    }

    public function test_every_path_in_the_mark_is_found_with_a_brand_role(): void
    {
        $shapes = $this->logo()->shapes();

        $this->assertCount(7, $shapes);
        $roles = array_count_values(array_column($shapes, 'role'));
        $this->assertSame(['amber' => 3, 'rust' => 1, 'flame' => 1, 'brown' => 2], $roles);
        $this->assertContains('text-cafe', array_column($shapes, 'id'));
    }

    public function test_placed_scales_to_the_width_and_keeps_the_aspect(): void
    {
        $logo = $this->logo();
        $placed = $logo->placed(10.0, 20.0, 40.0);

        $xs = $ys = [];
        foreach ($placed as $shape) {
            [$x0, $y0, $x1, $y1] = SvgPath::bounds($shape['ops']);
            $xs[] = $x0;
            $xs[] = $x1;
            $ys[] = $y0;
            $ys[] = $y1;
            $this->assertSame(BrandCmyk::chosen($shape['role']), $shape['cmyk']);
        }
        // Inside the 40 mm box (curve control points may poke out a hair).
        $this->assertGreaterThanOrEqual(9.0, min($xs));
        $this->assertLessThanOrEqual(51.0, max($xs));
        $this->assertGreaterThanOrEqual(19.0, min($ys));
        $this->assertLessThanOrEqual(20.0 + $logo->heightFor(40.0) + 1.0, max($ys));
        $this->assertEqualsWithDelta(690 / 990, $logo->aspect(), 1e-6);
    }

    public function test_dark_colourway_sets_the_wordmark_in_cream(): void
    {
        $light = array_column($this->logo()->placed(0, 0, 10, 'light'), 'role');
        $dark = array_column($this->logo()->placed(0, 0, 10, 'dark'), 'role');

        $this->assertContains('brown', $light);
        $this->assertNotContains('brown', $dark);
        $this->assertContains('cream', $dark);
    }

    public function test_still_svg_has_no_animation_and_is_on_palette(): void
    {
        $svg = $this->logo()->stillSvg('light');

        $this->assertStringNotContainsString('<style', $svg);
        $this->assertStringNotContainsString('<filter', $svg);
        $this->assertStringNotContainsString('<animate', $svg);
        $this->assertStringNotContainsString('class=', $svg);
        $this->assertStringNotContainsString('filter=', $svg);
        $this->assertStringNotContainsStringIgnoringCase('#B84B0C', $svg, 'the off-palette rust is corrected');
        $this->assertStringContainsStringIgnoringCase(BrandCmyk::HEX['rust'], $svg);
        $this->assertSame(7, substr_count($svg, '<path'));

        $dark = $this->logo()->stillSvg('dark');
        $this->assertStringContainsStringIgnoringCase('#FFFDF9', $dark);
    }

    public function test_the_committed_still_logos_match_the_generator(): void
    {
        $this->assertSame($this->logo()->stillSvg('light'), file_get_contents(public_path('brand/logo.svg')));
        $this->assertSame(
            LogoVector::fromFile(public_path('brand/logo-animated-dark.svg'))->stillSvg('dark'),
            file_get_contents(public_path('brand/logo-dark.svg')),
        );
    }
}
