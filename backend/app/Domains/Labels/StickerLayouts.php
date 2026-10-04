<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use InvalidArgumentException;

/**
 * Where pack stickers sit on a sheet, for every label stock the hub prints on.
 *
 * Owner, 2026-10-04, on which stock to support: "add all options". The sticker
 * was designed at 105 × 148.5 mm (A4 cut in four). A label of another size gets
 * the same design scaled to fit and centred while it stays readable; below
 * that (8 and 12 to an A4, small roll labels) it gets the compact "mini"
 * sticker, whose type is fixed rather than scaled.
 */
final class StickerLayouts
{
    public const DESIGN_W = 105.0;

    public const DESIGN_H = 148.5;

    /** Under this scale the full design's ingredient line drops below ~5.3pt. */
    public const FULL_MIN_SCALE = 0.7;

    /** The smallest label the mini design is laid out for. */
    public const MIN_W = 50.0;

    public const MIN_H = 45.0;

    public const MAX_W = 210.0;

    public const MAX_H = 297.0;

    /**
     * @var array<string, array{label: string, hint: string, page: array{0: float, 1: float}, cols: int, rows: int, w: float, h: float, cut: bool, precut?: bool}>
     */
    public const LAYOUTS = [
        'a4-4' => ['label' => '4 on A4', 'hint' => 'Plain A4, cut on the dashed lines (105 × 148.5 mm)', 'page' => [210.0, 297.0], 'cols' => 2, 'rows' => 2, 'w' => 105.0, 'h' => 148.5, 'cut' => true],
        'a4-4-precut' => ['label' => '4 on A4, pre-cut sheet', 'hint' => 'Ready-cut 4-up label sheets; nudge the position in Settings', 'page' => [210.0, 297.0], 'cols' => 2, 'rows' => 2, 'w' => 105.0, 'h' => 148.5, 'cut' => false, 'precut' => true],
        'a4-2' => ['label' => '2 on A4', 'hint' => 'Two full-size stickers on landscape A4', 'page' => [297.0, 210.0], 'cols' => 2, 'rows' => 1, 'w' => 105.0, 'h' => 148.5, 'cut' => true],
        // Inside a 6 mm margin, which plain-paper printers need; the 4-up keeps
        // the original edge-to-edge cut because its design has its own 5 mm.
        'a4-8' => ['label' => '8 on A4', 'hint' => 'Compact sticker, 99 × 70 mm', 'page' => [210.0, 297.0], 'cols' => 2, 'rows' => 4, 'w' => 99.0, 'h' => 70.5, 'cut' => true],
        'a4-12' => ['label' => '12 on A4', 'hint' => 'Compact sticker, 66 × 72 mm', 'page' => [210.0, 297.0], 'cols' => 3, 'rows' => 4, 'w' => 66.0, 'h' => 72.0, 'cut' => true],
        'single-105x148' => ['label' => 'Label printer, 105 × 148 mm', 'hint' => 'One sticker per page (A6 labels)', 'page' => [105.0, 148.5], 'cols' => 1, 'rows' => 1, 'w' => 105.0, 'h' => 148.5, 'cut' => false],
        'single-100x150' => ['label' => 'Label printer, 100 × 150 mm', 'hint' => '4 × 6 inch thermal labels', 'page' => [100.0, 150.0], 'cols' => 1, 'rows' => 1, 'w' => 100.0, 'h' => 150.0, 'cut' => false],
        'single-76x127' => ['label' => 'Label printer, 76 × 127 mm', 'hint' => '3 × 5 inch labels', 'page' => [76.0, 127.0], 'cols' => 1, 'rows' => 1, 'w' => 76.0, 'h' => 127.0, 'cut' => false],
        'single-custom' => ['label' => 'Custom size', 'hint' => 'Any label size from 50 × 45 mm to A4', 'page' => [0.0, 0.0], 'cols' => 1, 'rows' => 1, 'w' => 0.0, 'h' => 0.0, 'cut' => false],
    ];

    /**
     * The sheet for a layout: page size, each label's box on the page, and
     * how the design fits a label.
     *
     * @param array{top?: float, left?: float, gutter?: float} $precut
     * @return array{key: string, label: string, page_w: float, page_h: float, slots: list<array{x: float, y: float, w: float, h: float}>, per_page: int, w: float, h: float, cut: bool, design: 'full'|'mini', scale: float, dx: float, dy: float}
     */
    public static function resolve(string $key, ?float $customW = null, ?float $customH = null, array $precut = []): array
    {
        $layout = self::LAYOUTS[$key] ?? throw new InvalidArgumentException("Unknown label layout {$key}.");
        [$pageW, $pageH] = $layout['page'];
        $w = $layout['w'];
        $h = $layout['h'];

        if ($key === 'single-custom') {
            $w = round((float) $customW, 2);
            $h = round((float) $customH, 2);
            if ($w < self::MIN_W || $h < self::MIN_H || $w > self::MAX_W || $h > self::MAX_H) {
                throw new InvalidArgumentException(sprintf(
                    'Labels can be from %d × %d mm up to %d × %d mm; %s × %s mm is outside that.',
                    self::MIN_W,
                    self::MIN_H,
                    self::MAX_W,
                    self::MAX_H,
                    self::num($w),
                    self::num($h),
                ));
            }
            [$pageW, $pageH] = [$w, $h];
        }

        $gutter = !empty($layout['precut']) ? max(0.0, (float) ($precut['gutter'] ?? 0)) : 0.0;
        $gridW = $layout['cols'] * $w + ($layout['cols'] - 1) * $gutter;
        $gridH = $layout['rows'] * $h + ($layout['rows'] - 1) * $gutter;
        // Centred on the page; a pre-cut sheet is nudged by the owner's offsets.
        $ox = ($pageW - $gridW) / 2 + (!empty($layout['precut']) ? (float) ($precut['left'] ?? 0) : 0.0);
        $oy = ($pageH - $gridH) / 2 + (!empty($layout['precut']) ? (float) ($precut['top'] ?? 0) : 0.0);

        $slots = [];
        for ($r = 0; $r < $layout['rows']; $r++) {
            for ($c = 0; $c < $layout['cols']; $c++) {
                $slots[] = ['x' => round($ox + $c * ($w + $gutter), 3), 'y' => round($oy + $r * ($h + $gutter), 3), 'w' => $w, 'h' => $h];
            }
        }

        $scale = min($w / self::DESIGN_W, $h / self::DESIGN_H);
        $design = $scale >= self::FULL_MIN_SCALE ? 'full' : 'mini';
        if ($design === 'mini') {
            $scale = 1.0;
        }

        return [
            'key' => $key,
            'label' => $key === 'single-custom' ? sprintf('Custom, %s × %s mm', self::num($w), self::num($h)) : $layout['label'],
            'page_w' => $pageW,
            'page_h' => $pageH,
            'slots' => $slots,
            'per_page' => count($slots),
            'w' => $w,
            'h' => $h,
            'cut' => $layout['cut'],
            'design' => $design,
            'scale' => round($scale, 4),
            // The full design centred in a label that is not its exact shape.
            'dx' => $design === 'full' ? round(($w - self::DESIGN_W * $scale) / 2, 3) : 0.0,
            'dy' => $design === 'full' ? round(($h - self::DESIGN_H * $scale) / 2, 3) : 0.0,
        ];
    }

    private static function num(float $n): string
    {
        return rtrim(rtrim(number_format($n, 1, '.', ''), '0'), '.');
    }
}
