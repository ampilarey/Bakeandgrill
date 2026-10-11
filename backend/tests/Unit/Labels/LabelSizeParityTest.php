<?php

declare(strict_types=1);

namespace Tests\Unit\Labels;

use App\Domains\Labels\StickerLayouts;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Pins StickerLayouts to fixtures/label_size_parity.json, the table the admin
 * size picker (components/labels/labelSize.ts) is checked against too, so the
 * picker's "21 on A4" and "too small" say what the server will print.
 */
class LabelSizeParityTest extends TestCase
{
    private const FIXTURE_RELATIVE = 'fixtures/label_size_parity.json';

    /** @return array{repo_relative_path: string, limits: array<string, float|int>, sizes: list<array<string, mixed>>} */
    private function fixture(): array
    {
        // backend/tests/Unit/Labels → repo root is four levels up
        $path = dirname(__DIR__, 4) . '/' . self::FIXTURE_RELATIVE;
        $this->assertFileExists($path, 'Shared label size fixture must exist at repo root');
        $decoded = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame(self::FIXTURE_RELATIVE, $decoded['repo_relative_path'] ?? null);

        return $decoded;
    }

    private function fits(string $layout, float $w, ?float $h): bool
    {
        try {
            StickerLayouts::resolve($layout, $w, $h);

            return true;
        } catch (InvalidArgumentException) {
            return false;
        }
    }

    #[Test]
    public function limits_match_the_shared_table(): void
    {
        $this->assertEquals($this->fixture()['limits'], StickerLayouts::limits());
    }

    #[Test]
    public function every_size_gets_the_design_grid_and_fit_in_the_shared_table(): void
    {
        foreach ($this->fixture()['sizes'] as $s) {
            $w = (float) $s['w'];
            $h = (float) $s['h'];
            $round = $s['shape'] === 'circle';
            $name = StickerLayouts::sizeName($s['shape'], $w, $h);
            [$pageW, $pageH, $cols, $rows] = StickerLayouts::grid($w, $h);

            $this->assertSame($s['design'], StickerLayouts::design($s['shape'], $w, $h), "{$name}: design");
            $this->assertEquals($s['a4'], ['page_w' => $pageW, 'page_h' => $pageH, 'cols' => $cols, 'rows' => $rows], "{$name}: A4 grid");
            $this->assertSame($s['fits_sheet'], $this->fits($round ? 'a4-round-custom' : 'a4-custom', $w, $round ? null : $h), "{$name}: on an A4 sheet");
            $this->assertSame($s['fits_printer'], $this->fits($round ? 'single-round-custom' : 'single-custom', $w, $round ? null : $h), "{$name}: on a label printer");
        }
    }
}
