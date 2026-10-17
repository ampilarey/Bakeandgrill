<?php

declare(strict_types=1);

namespace Tests\Unit\Posters;

use App\Domains\Posters\SvgPath;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class SvgPathTest extends TestCase
{
    /** @return list<array{0: string, 1: list<float>}> */
    private function parse(string $d): array
    {
        return SvgPath::parse($d, static fn (float $x, float $y): array => [$x, $y]);
    }

    public function test_absolute_and_relative_lines_close_back_to_the_subpath_start(): void
    {
        $ops = $this->parse('M10 10 L20 10 l0 10 H10 v-5 Z');

        $this->assertSame(['M', [10.0, 10.0]], $ops[0]);
        $this->assertSame(['L', [20.0, 10.0]], $ops[1]);
        $this->assertSame(['L', [20.0, 20.0]], $ops[2]);
        $this->assertSame(['L', [10.0, 20.0]], $ops[3]);
        $this->assertSame(['L', [10.0, 15.0]], $ops[4]);
        $this->assertSame(['Z', []], $ops[5]);
    }

    public function test_implicit_lineto_after_moveto_and_comma_separators(): void
    {
        $ops = $this->parse('m5,5 10,0 0,10z');

        $this->assertSame(['M', [5.0, 5.0]], $ops[0]);
        $this->assertSame(['L', [15.0, 5.0]], $ops[1]);
        $this->assertSame(['L', [15.0, 15.0]], $ops[2]);
        $this->assertSame('Z', $ops[3][0]);
    }

    public function test_curves_keep_their_control_points_and_smooth_curves_reflect(): void
    {
        $ops = $this->parse('M0 0 C1 2 3 4 5 6 S9 10 11 12');

        $this->assertSame(['C', [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]], $ops[1]);
        // S reflects the previous second control point (3,4) about (5,6) → (7,8).
        $this->assertSame(['C', [7.0, 8.0, 9.0, 10.0, 11.0, 12.0]], $ops[2]);
    }

    public function test_quadratics_become_cubics(): void
    {
        $ops = $this->parse('M0 0 Q3 6 6 0');

        $this->assertSame('C', $ops[1][0]);
        $this->assertEqualsWithDelta([2.0, 4.0, 4.0, 4.0, 6.0, 0.0], $ops[1][1], 1e-9);
    }

    public function test_the_mapper_places_every_point(): void
    {
        $ops = SvgPath::parse('M1 1 L2 2', static fn (float $x, float $y): array => [$x * 10 + 100, $y * 10 + 200]);

        $this->assertSame(['M', [110.0, 210.0]], $ops[0]);
        $this->assertSame(['L', [120.0, 220.0]], $ops[1]);
    }

    public function test_arcs_are_refused_rather_than_approximated(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->parse('M0 0 A5 5 0 0 1 10 10');
    }

    public function test_bounds_cover_control_points(): void
    {
        $ops = $this->parse('M10 10 C0 0 40 40 20 20 Z');

        $this->assertSame([0.0, 0.0, 40.0, 40.0], SvgPath::bounds($ops));
        $this->assertSame([0.0, 0.0, 0.0, 0.0], SvgPath::bounds([]));
    }
}
