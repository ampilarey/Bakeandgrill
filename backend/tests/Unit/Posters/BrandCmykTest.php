<?php

declare(strict_types=1);

namespace Tests\Unit\Posters;

use App\Domains\Posters\BrandCmyk;
use PHPUnit\Framework\TestCase;

class BrandCmykTest extends TestCase
{
    public function test_plain_conversion_of_the_brand_rust(): void
    {
        // #B74B0C: red is the fullest channel, so no cyan; black from what is missing.
        [$c, $m, $y, $k] = BrandCmyk::fromHex('#B74B0C');

        $this->assertSame(0.0, $c);
        $this->assertEqualsWithDelta(59.0, $m, 0.1);
        $this->assertEqualsWithDelta(93.4, $y, 0.1);
        $this->assertEqualsWithDelta(28.2, $k, 0.1);
    }

    public function test_black_and_white_are_exact(): void
    {
        $this->assertSame([0.0, 0.0, 0.0, 100.0], BrandCmyk::fromHex('000000'));
        $this->assertSame([0.0, 0.0, 0.0, 0.0], BrandCmyk::fromHex('#FFFFFF'));
    }

    public function test_five_candidates_per_role_with_a_as_the_plain_conversion(): void
    {
        foreach (array_keys(BrandCmyk::HEX) as $role) {
            $set = BrandCmyk::candidates($role);
            $this->assertSame(BrandCmyk::CANDIDATE_KEYS, array_keys($set), $role);
            $this->assertSame(BrandCmyk::fromHex(BrandCmyk::HEX[$role]), $set['A'], $role);
            foreach ($set as $cmyk) {
                foreach ($cmyk as $v) {
                    $this->assertGreaterThanOrEqual(0.0, $v);
                    $this->assertLessThanOrEqual(100.0, $v);
                }
            }
        }
    }

    public function test_rust_candidates_move_the_way_the_card_says(): void
    {
        $set = BrandCmyk::candidates('rust');

        $this->assertLessThan($set['A'][3], $set['B'][3], 'B has less black');
        $this->assertGreaterThan($set['A'][2], $set['C'][2], 'C is warmer: more yellow');
        $this->assertLessThan($set['A'][1], $set['C'][1], 'C is warmer: less magenta');
        $this->assertGreaterThan($set['A'][3], $set['D'][3], 'D is deeper');
        foreach ($set['E'] as $v) {
            $this->assertSame(0.0, fmod($v, 5.0), 'E is a round press mix');
        }
    }

    public function test_cream_never_goes_darker_than_paper(): void
    {
        $set = BrandCmyk::candidates('cream');

        $this->assertSame(BrandCmyk::PAPER_WHITE, $set['E']);
        foreach ($set as $cmyk) {
            $this->assertLessThanOrEqual(5.0, max($cmyk));
        }
    }

    public function test_label_is_the_press_shorthand(): void
    {
        $this->assertSame('0 / 59 / 93 / 28', BrandCmyk::label([0.0, 59.0, 93.4, 28.2]));
    }

    public function test_chosen_falls_back_to_a_without_a_database(): void
    {
        $this->assertSame(BrandCmyk::candidates('amber')['A'], BrandCmyk::chosen('amber'));
    }
}
