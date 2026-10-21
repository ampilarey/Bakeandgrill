<?php

declare(strict_types=1);

namespace Tests\Unit\Posters;

use App\Domains\Posters\PaperSize;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

/**
 * Page geometry from docs/POSTER_PLAN.md § 6.1 and § 8: bleed outside the
 * trim, safe zone inside it, and the resolution a photo gives on each size.
 */
class PaperSizeTest extends TestCase
{
    public function test_a3_boxes_with_the_default_bleed(): void
    {
        $a3 = PaperSize::named('a3');

        $this->assertSame('A3', $a3->name);
        $this->assertSame(303.0, $a3->bleedWidth());
        $this->assertSame(426.0, $a3->bleedHeight());
        $this->assertSame([3.0, 3.0, 297.0, 420.0], $a3->trimBox());
        // Safe zone is 8 mm on A3, measured from the trim.
        $this->assertSame([11.0, 11.0, 281.0, 404.0], $a3->safeBox());
    }

    public function test_landscape_swaps_the_sides_and_bleed_is_adjustable(): void
    {
        $a4 = PaperSize::named('A4', true, 5.0);

        $this->assertTrue($a4->landscape);
        $this->assertSame(297.0, $a4->trimWidth);
        $this->assertSame(210.0, $a4->trimHeight);
        $this->assertSame(307.0, $a4->bleedWidth());
        $this->assertSame([5.0, 5.0, 297.0, 210.0], $a4->trimBox());
    }

    public function test_pixel_maths_round_trips_through_ppi(): void
    {
        $a3 = PaperSize::named('A3');
        [$w, $h] = $a3->pixelsAt(150);

        $this->assertSame(1790, $w);
        $this->assertSame(2516, $h);
        $this->assertEqualsWithDelta(150.0, $a3->ppiOf($w, $h), 0.2);
        // A square photo is limited by its short side against the tall page.
        $this->assertEqualsWithDelta(3200 / (426 / 25.4), $a3->ppiOf(3200, 3200), 0.01);
    }

    public function test_amber_lines_follow_the_plan(): void
    {
        $this->assertSame(200, PaperSize::named('A5')->amberPpi());
        $this->assertSame(200, PaperSize::named('A4')->amberPpi());
        $this->assertSame(120, PaperSize::named('A3')->amberPpi());
        $this->assertSame(120, PaperSize::named('A2')->amberPpi());
        $this->assertSame(100, PaperSize::PPI_RED);
    }

    public function test_a_screen_is_its_pixels_with_no_bleed_and_its_own_orientation(): void
    {
        $tv = PaperSize::named('tv');
        $this->assertTrue($tv->isScreen());
        $this->assertSame('TV', $tv->name);
        $this->assertSame(PaperSize::KIND_SCREEN, $tv->kind);
        $this->assertTrue($tv->landscape);
        $this->assertSame(0.0, $tv->bleed);
        $this->assertSame([1920, 1080], $tv->pixels());
        $this->assertSame(1920.0, $tv->bleedWidth());
        $this->assertSame([0.0, 0.0, 1920.0, 1080.0], $tv->trimBox());
        $this->assertSame([60.0, 60.0, 1800.0, 960.0], $tv->safeBox());
        $this->assertSame('TV · Full HD (1920 × 1080)', $tv->label());
        $this->assertSame(1.0, $tv->screenScale());
        $this->assertSame(0.0, $tv->keepOutMm());
        $this->assertSame($tv, $tv->mounted('standoffs'), 'nothing is mounted on a screen');

        // The landscape flag is the paper's; a screen keeps its own orientation.
        $this->assertTrue(PaperSize::named('TV', landscape: false)->landscape);
        $portrait = PaperSize::named('TVP', landscape: true);
        $this->assertFalse($portrait->landscape);
        $this->assertSame([1080, 1920], $portrait->pixels());
        $this->assertSame(1.0, $portrait->screenScale());
        $this->assertSame(2.0, PaperSize::named('TV4K')->screenScale());
        $this->assertSame([3840, 2160], PaperSize::named('TV4K')->pixels());
        $this->assertSame(1.0, PaperSize::named('A4')->screenScale());

        $this->assertSame(PaperSize::KIND_SCREEN, PaperSize::kindOf('tv4k'));
        $this->assertSame(PaperSize::KIND_PAPER, PaperSize::kindOf('a5'));
        $this->assertNull(PaperSize::kindOf('A6'));
        $this->assertTrue(PaperSize::isKnown('TVP'));
        $this->assertFalse(PaperSize::isKnown('TVX'));
        $this->assertSame(['TV', 'TV4K', 'TVP'], array_column(PaperSize::screens(), 'key'));
        $this->assertSame([1080, 1920], PaperSize::screens()[2]['px']);
    }

    public function test_unknown_size_is_refused(): void
    {
        $this->expectException(InvalidArgumentException::class);
        PaperSize::named('A6');
    }
}
