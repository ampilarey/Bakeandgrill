<?php

declare(strict_types=1);

namespace App\Domains\Posters;

/**
 * How copies sit on the sheet (docs/POSTER_PLAN.md § 6.5). Tent is two A5
 * panels on A4, the second turned 180° so both read when the sheet is
 * folded. 2-up and 4-up step the poster, bleed and all, into a grid.
 */
final class PosterImposition
{
    /**
     * @return array{page: PaperSize, copies: list<array{ox: float, oy: float, scale: float, rotate: int}>, label: string}
     */
    public static function plan(PaperSize $poster, string $mode): array
    {
        // A screen is one picture; nothing is stepped onto it.
        if ($poster->isScreen()) {
            $mode = 'single';
        }
        if ($mode === 'tent' && $poster->name === 'A5') {
            return self::tent($poster);
        }
        if ($mode === '2up') {
            return self::grid($poster, 2, 1, '2-up');
        }
        if ($mode === '4up') {
            return self::grid($poster, 2, 2, '4-up');
        }

        return [
            'page' => $poster,
            'copies' => [['ox' => 0.0, 'oy' => 0.0, 'scale' => 1.0, 'rotate' => 0]],
            'label' => 'one per page',
        ];
    }

    /** @return array{page: PaperSize, copies: list<array{ox: float, oy: float, scale: float, rotate: int}>, label: string} */
    private static function tent(PaperSize $poster): array
    {
        $page = PaperSize::named('A4', true);
        $panelW = $page->bleedWidth() / 2;
        $panelH = $page->bleedHeight();
        $scale = min($panelW / $poster->bleedWidth(), $panelH / $poster->bleedHeight());
        $pw = $poster->bleedWidth() * $scale;
        $ph = $poster->bleedHeight() * $scale;
        $copies = [];
        for ($i = 0; $i < 2; $i++) {
            $copies[] = [
                'ox' => $i * $panelW + ($panelW - $pw) / 2,
                'oy' => ($panelH - $ph) / 2,
                'scale' => $scale,
                'rotate' => $i === 1 ? 180 : 0,
            ];
        }

        return ['page' => $page, 'copies' => $copies, 'label' => 'tent, two A5 on A4'];
    }

    /** @return array{page: PaperSize, copies: list<array{ox: float, oy: float, scale: float, rotate: int}>, label: string} */
    private static function grid(PaperSize $poster, int $cols, int $rows, string $label): array
    {
        $page = PaperSize::custom($poster->bleedWidth() * $cols, $poster->bleedHeight() * $rows);
        $copies = [];
        for ($r = 0; $r < $rows; $r++) {
            for ($c = 0; $c < $cols; $c++) {
                $copies[] = [
                    'ox' => $c * $poster->bleedWidth(),
                    'oy' => $r * $poster->bleedHeight(),
                    'scale' => 1.0,
                    'rotate' => 0,
                ];
            }
        }

        return ['page' => $page, 'copies' => $copies, 'label' => $label];
    }
}
