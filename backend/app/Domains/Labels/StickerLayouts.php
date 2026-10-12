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
 * sticker, whose type is fixed rather than scaled; below that again (owner,
 * 2026-10-11: "Add label size. For example rectangular 4 cm by 6 cm, circle
 * 6 cm diameter") the "small" sticker (SmallStickerDesign), down to 30 × 20 mm.
 *
 * Any size prints on a label printer (one label per page) or on A4, as many
 * as fit inside a 5 mm edge, cut on the dashed lines. PRESETS are the sizes the
 * hub offers as one tap; each says which layout prints it on which stock.
 */
final class StickerLayouts
{
    public const DESIGN_W = 105.0;

    public const DESIGN_H = 148.5;

    /** Under this scale the full design's ingredient line drops below ~5.3pt. */
    public const FULL_MIN_SCALE = 0.7;

    /** The compact sticker needs this much room (ingredients included); a smaller label gets the small one. */
    public const MINI_MIN_W = 50.0;

    public const MINI_MIN_H = 60.0;

    /** Wider than this (w ÷ h) and the compact sticker's stack wastes the width; the small one puts the dates beside the name. */
    public const MINI_MAX_RATIO = 1.6;

    /** A custom rectangle: the short side at least this, the long side at least MIN_LONG. */
    public const MIN_SHORT = 20.0;

    public const MIN_LONG = 30.0;

    public const MAX_W = 210.0;

    public const MAX_H = 297.0;

    public const MIN_ROUND = 30.0;

    public const MAX_ROUND = 200.0;

    /** The blank edge round an A4 sheet of a custom size: plain-paper printers do not print to the edge. */
    public const SHEET_MARGIN = 5.0;

    /**
     * @var array<string, array{label: string, hint: string, page: array{0: float, 1: float}, cols: int, rows: int, w: float, h: float, cut: bool, precut?: bool, shape?: string, grid?: bool}>
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
        'single-custom' => ['label' => 'Custom size', 'hint' => 'Any label size from 30 × 20 mm to A4, one per label', 'page' => [0.0, 0.0], 'cols' => 1, 'rows' => 1, 'w' => 0.0, 'h' => 0.0, 'cut' => false],
        // Owner, 2026-10-11: any size on A4, as many as fit (40 × 60 mm: 21 to a sheet).
        'a4-custom' => ['label' => 'Any size on A4', 'hint' => 'As many as fit on an A4 sheet, cut on the dashed lines', 'page' => [210.0, 297.0], 'cols' => 0, 'rows' => 0, 'w' => 0.0, 'h' => 0.0, 'cut' => true, 'grid' => true],
        // v2 point 2: round stickers, their own centred design (StickerDesign::round).
        'a4-round-50' => ['label' => 'Round 50 mm, 20 on A4', 'hint' => 'Round stickers 50 mm across; cut on the dashed circles', 'page' => [210.0, 297.0], 'cols' => 4, 'rows' => 5, 'w' => 50.0, 'h' => 50.0, 'cut' => true, 'shape' => 'circle'],
        'a4-round-70' => ['label' => 'Round 70 mm, 8 on A4', 'hint' => 'Round stickers 70 mm across, with the QR and a batch line', 'page' => [210.0, 297.0], 'cols' => 2, 'rows' => 4, 'w' => 70.0, 'h' => 70.0, 'cut' => true, 'shape' => 'circle'],
        'single-round-50' => ['label' => 'Label printer, round 50 mm', 'hint' => 'One round sticker per label', 'page' => [50.0, 50.0], 'cols' => 1, 'rows' => 1, 'w' => 50.0, 'h' => 50.0, 'cut' => false, 'shape' => 'circle'],
        'single-round-70' => ['label' => 'Label printer, round 70 mm', 'hint' => 'One round sticker per label, with the QR', 'page' => [70.0, 70.0], 'cols' => 1, 'rows' => 1, 'w' => 70.0, 'h' => 70.0, 'cut' => false, 'shape' => 'circle'],
        'single-round-custom' => ['label' => 'Custom round size', 'hint' => 'Any round sticker from 30 to 200 mm across, one per label', 'page' => [0.0, 0.0], 'cols' => 1, 'rows' => 1, 'w' => 0.0, 'h' => 0.0, 'cut' => false, 'shape' => 'circle'],
        'a4-round-custom' => ['label' => 'Any round size on A4', 'hint' => 'As many circles as fit on an A4 sheet, cut on the dashed circles', 'page' => [210.0, 297.0], 'cols' => 0, 'rows' => 0, 'w' => 0.0, 'h' => 0.0, 'cut' => true, 'shape' => 'circle', 'grid' => true],
    ];

    /** Layouts whose label size comes with the request (w, and h for a rectangle). */
    public const SIZED = ['single-custom', 'a4-custom', 'single-round-custom', 'a4-round-custom'];

    /**
     * The sizes the hub offers as one tap, biggest first, and the layout that
     * prints each on each stock: `sheet` plain A4 cut on the lines, `precut` a
     * ready-cut A4 sheet, `landscape` two on landscape A4, `printer` a label
     * printer, one per label.
     *
     * @var list<array{id: string, shape: 'rect'|'circle', w: float, h: float, on: array<string, string>}>
     */
    public const PRESETS = [
        ['id' => 'r105x148', 'shape' => 'rect', 'w' => 105.0, 'h' => 148.5, 'on' => ['sheet' => 'a4-4', 'precut' => 'a4-4-precut', 'landscape' => 'a4-2', 'printer' => 'single-105x148']],
        ['id' => 'r100x150', 'shape' => 'rect', 'w' => 100.0, 'h' => 150.0, 'on' => ['sheet' => 'a4-custom', 'printer' => 'single-100x150']],
        ['id' => 'r76x127', 'shape' => 'rect', 'w' => 76.0, 'h' => 127.0, 'on' => ['sheet' => 'a4-custom', 'printer' => 'single-76x127']],
        ['id' => 'r99x70', 'shape' => 'rect', 'w' => 99.0, 'h' => 70.5, 'on' => ['sheet' => 'a4-8', 'printer' => 'single-custom']],
        ['id' => 'r66x72', 'shape' => 'rect', 'w' => 66.0, 'h' => 72.0, 'on' => ['sheet' => 'a4-12', 'printer' => 'single-custom']],
        ['id' => 'r100x50', 'shape' => 'rect', 'w' => 100.0, 'h' => 50.0, 'on' => ['sheet' => 'a4-custom', 'printer' => 'single-custom']],
        ['id' => 'r70x50', 'shape' => 'rect', 'w' => 70.0, 'h' => 50.0, 'on' => ['sheet' => 'a4-custom', 'printer' => 'single-custom']],
        ['id' => 'r60x40', 'shape' => 'rect', 'w' => 60.0, 'h' => 40.0, 'on' => ['sheet' => 'a4-custom', 'printer' => 'single-custom']],
        ['id' => 'r40x60', 'shape' => 'rect', 'w' => 40.0, 'h' => 60.0, 'on' => ['sheet' => 'a4-custom', 'printer' => 'single-custom']],
        ['id' => 'r50x30', 'shape' => 'rect', 'w' => 50.0, 'h' => 30.0, 'on' => ['sheet' => 'a4-custom', 'printer' => 'single-custom']],
        ['id' => 'r40x30', 'shape' => 'rect', 'w' => 40.0, 'h' => 30.0, 'on' => ['sheet' => 'a4-custom', 'printer' => 'single-custom']],
        // Owner, 2026-10-12: "I need more size options". Common label-printer
        // rolls and jar and box lids: 50 × 80, 60 × 90, 80 × 120, a 100 mm
        // square, and 80 and 100 mm rounds.
        ['id' => 'r50x80', 'shape' => 'rect', 'w' => 50.0, 'h' => 80.0, 'on' => ['sheet' => 'a4-custom', 'printer' => 'single-custom']],
        ['id' => 'r60x90', 'shape' => 'rect', 'w' => 60.0, 'h' => 90.0, 'on' => ['sheet' => 'a4-custom', 'printer' => 'single-custom']],
        ['id' => 'r80x120', 'shape' => 'rect', 'w' => 80.0, 'h' => 120.0, 'on' => ['sheet' => 'a4-custom', 'printer' => 'single-custom']],
        ['id' => 'r100x100', 'shape' => 'rect', 'w' => 100.0, 'h' => 100.0, 'on' => ['sheet' => 'a4-custom', 'printer' => 'single-custom']],
        ['id' => 'c100', 'shape' => 'circle', 'w' => 100.0, 'h' => 100.0, 'on' => ['sheet' => 'a4-round-custom', 'printer' => 'single-round-custom']],
        ['id' => 'c80', 'shape' => 'circle', 'w' => 80.0, 'h' => 80.0, 'on' => ['sheet' => 'a4-round-custom', 'printer' => 'single-round-custom']],
        ['id' => 'c70', 'shape' => 'circle', 'w' => 70.0, 'h' => 70.0, 'on' => ['sheet' => 'a4-round-70', 'printer' => 'single-round-70']],
        ['id' => 'c60', 'shape' => 'circle', 'w' => 60.0, 'h' => 60.0, 'on' => ['sheet' => 'a4-round-custom', 'printer' => 'single-round-custom']],
        ['id' => 'c50', 'shape' => 'circle', 'w' => 50.0, 'h' => 50.0, 'on' => ['sheet' => 'a4-round-50', 'printer' => 'single-round-50']],
        ['id' => 'c40', 'shape' => 'circle', 'w' => 40.0, 'h' => 40.0, 'on' => ['sheet' => 'a4-round-custom', 'printer' => 'single-round-custom']],
        ['id' => 'c30', 'shape' => 'circle', 'w' => 30.0, 'h' => 30.0, 'on' => ['sheet' => 'a4-round-custom', 'printer' => 'single-round-custom']],
    ];

    /** What each stock is called in the hub. */
    public const STOCKS = [
        'sheet' => 'A4 sheet',
        'precut' => 'Ready-cut A4 sheet',
        'landscape' => 'A4 landscape',
        'printer' => 'Label printer',
    ];

    public static function shape(string $key): string
    {
        return self::LAYOUTS[$key]['shape'] ?? 'rect';
    }

    /**
     * The sheet for a layout: page size, each label's box on the page, and
     * how the design fits a label.
     *
     * @param array{top?: float, left?: float, gutter?: float} $precut
     * @return array{key: string, label: string, shape: 'rect'|'circle', page_w: float, page_h: float, slots: list<array{x: float, y: float, w: float, h: float}>, per_page: int, w: float, h: float, cut: bool, design: 'full'|'mini'|'small'|'round', scale: float, dx: float, dy: float}
     */
    public static function resolve(string $key, ?float $customW = null, ?float $customH = null, array $precut = []): array
    {
        $layout = self::LAYOUTS[$key] ?? throw new InvalidArgumentException("Unknown label layout {$key}.");
        [$pageW, $pageH] = $layout['page'];
        $w = $layout['w'];
        $h = $layout['h'];
        $cols = $layout['cols'];
        $rows = $layout['rows'];
        $shape = $layout['shape'] ?? 'rect';
        $grid = !empty($layout['grid']);

        if (in_array($key, self::SIZED, true)) {
            $w = round((float) $customW, 2);
            $h = $shape === 'circle' ? $w : round((float) $customH, 2);
            self::checkSize($shape, $w, $h, $grid);
            if ($grid) {
                [$pageW, $pageH, $cols, $rows] = self::grid($w, $h);
            } else {
                [$pageW, $pageH] = [$w, $h];
            }
        }

        $gutter = !empty($layout['precut']) ? max(0.0, (float) ($precut['gutter'] ?? 0)) : 0.0;
        $gridW = $cols * $w + ($cols - 1) * $gutter;
        $gridH = $rows * $h + ($rows - 1) * $gutter;
        // Centred on the page; a pre-cut sheet is nudged by the owner's offsets.
        $ox = ($pageW - $gridW) / 2 + (!empty($layout['precut']) ? (float) ($precut['left'] ?? 0) : 0.0);
        $oy = ($pageH - $gridH) / 2 + (!empty($layout['precut']) ? (float) ($precut['top'] ?? 0) : 0.0);

        $slots = [];
        for ($r = 0; $r < $rows; $r++) {
            for ($c = 0; $c < $cols; $c++) {
                $slots[] = ['x' => round($ox + $c * ($w + $gutter), 3), 'y' => round($oy + $r * ($h + $gutter), 3), 'w' => $w, 'h' => $h];
            }
        }

        $design = self::design($shape, $w, $h);
        $scale = $design === 'full' ? min($w / self::DESIGN_W, $h / self::DESIGN_H) : 1.0;

        return [
            'key' => $key,
            'label' => self::label($key, $shape, $w, $h, count($slots)),
            'shape' => $shape,
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

    /** Which sticker design a label of this shape and size gets. */
    public static function design(string $shape, float $w, float $h): string
    {
        if ($shape === 'circle') {
            return 'round';
        }
        if (min($w / self::DESIGN_W, $h / self::DESIGN_H) >= self::FULL_MIN_SCALE) {
            return 'full';
        }
        if ($w >= self::MINI_MIN_W && $h >= self::MINI_MIN_H && $w / $h <= self::MINI_MAX_RATIO) {
            return 'mini';
        }

        return 'small';
    }

    /**
     * As many labels as fit on A4 inside the edge, on whichever way round the
     * page takes more (40 × 60 mm: 21 on landscape A4, 20 upright).
     *
     * @return array{0: float, 1: float, 2: int, 3: int} page width, page height, columns, rows
     */
    public static function grid(float $w, float $h): array
    {
        $best = null;
        foreach ([[210.0, 297.0], [297.0, 210.0]] as [$pw, $ph]) {
            $cols = (int) floor(($pw - 2 * self::SHEET_MARGIN + 0.001) / $w);
            $rows = (int) floor(($ph - 2 * self::SHEET_MARGIN + 0.001) / $h);
            if ($best === null || $cols * $rows > $best[2] * $best[3]) {
                $best = [$pw, $ph, $cols, $rows];
            }
        }

        return $best;
    }

    /**
     * The presets as the hub shows them: the size in mm and cm, the design it
     * gets, and for each stock its layout and how many go on a page.
     *
     * @return list<array<string, mixed>>
     */
    public static function presets(): array
    {
        return array_map(function (array $p): array {
            $options = [];
            foreach ($p['on'] as $on => $key) {
                $sheet = self::resolve($key, $p['w'], $p['h']);
                $options[] = ['on' => $on, 'layout' => $key, 'label' => self::STOCKS[$on], 'per_page' => $sheet['per_page'], 'landscape' => $sheet['page_w'] > $sheet['page_h']];
            }

            return [
                'id' => $p['id'],
                'shape' => $p['shape'],
                'w' => $p['w'],
                'h' => $p['h'],
                'name' => self::sizeName($p['shape'], $p['w'], $p['h']),
                'cm' => self::sizeCm($p['shape'], $p['w'], $p['h']),
                'design' => self::design($p['shape'], $p['w'], $p['h']),
                'options' => $options,
            ];
        }, self::PRESETS);
    }

    /**
     * The limits for a size typed in, as the hub checks them before asking.
     *
     * @return array{min_short: float, min_long: float, max_w: float, max_h: float, min_round: float, max_round: float, sheet_margin: float}
     */
    public static function limits(): array
    {
        return [
            'min_short' => self::MIN_SHORT,
            'min_long' => self::MIN_LONG,
            'max_w' => self::MAX_W,
            'max_h' => self::MAX_H,
            'min_round' => self::MIN_ROUND,
            'max_round' => self::MAX_ROUND,
            'sheet_margin' => self::SHEET_MARGIN,
        ];
    }

    /** "40 × 60 mm" or "Round 60 mm". */
    public static function sizeName(string $shape, float $w, float $h): string
    {
        return $shape === 'circle' ? 'Round ' . self::num($w) . ' mm' : self::num($w) . ' × ' . self::num($h) . ' mm';
    }

    /** "4 × 6 cm" or "6 cm across", the way the owner says it. */
    public static function sizeCm(string $shape, float $w, float $h): string
    {
        $cm = fn (float $mm): string => rtrim(rtrim(number_format($mm / 10, 2, '.', ''), '0'), '.');

        return $shape === 'circle' ? $cm($w) . ' cm across' : $cm($w) . ' × ' . $cm($h) . ' cm';
    }

    /** What a label is called on the summary, the saved label and the print log. */
    public static function label(string $key, string $shape, float $w, float $h, int $perPage): string
    {
        $layout = self::LAYOUTS[$key] ?? null;
        if ($layout === null || !in_array($key, self::SIZED, true)) {
            return $layout['label'] ?? $key;
        }

        return self::sizeName($shape, $w, $h) . (!empty($layout['grid']) ? ", {$perPage} on A4" : ', label printer');
    }

    /** A layout as words for the print log ("40 × 60 mm, 21 on A4"), from its key and the size it was printed at. */
    public static function describe(string $key, ?float $w, ?float $h): string
    {
        try {
            return self::resolve($key, $w, $h)['label'];
        } catch (\Throwable) {
            return self::LAYOUTS[$key]['label'] ?? $key;
        }
    }

    private static function checkSize(string $shape, float $w, float $h, bool $onSheet): void
    {
        if ($shape === 'circle') {
            $max = $onSheet ? min(self::MAX_W - 2 * self::SHEET_MARGIN, self::MAX_ROUND) : self::MAX_ROUND;
            if ($w < self::MIN_ROUND || $w > $max) {
                throw new InvalidArgumentException(sprintf('Round stickers can be from %d to %d mm across; %s mm is outside that.', self::MIN_ROUND, $max, self::num($w)));
            }

            return;
        }
        $short = min($w, $h);
        $long = max($w, $h);
        if ($short < self::MIN_SHORT || $long < self::MIN_LONG) {
            throw new InvalidArgumentException(sprintf('Labels can be from %d × %d mm; %s × %s mm is smaller than that.', self::MIN_LONG, self::MIN_SHORT, self::num($w), self::num($h)));
        }
        if ($onSheet) {
            $inW = self::MAX_W - 2 * self::SHEET_MARGIN;
            $inH = self::MAX_H - 2 * self::SHEET_MARGIN;
            if (!(($w <= $inW && $h <= $inH) || ($w <= $inH && $h <= $inW))) {
                throw new InvalidArgumentException(sprintf('A label on an A4 sheet can be up to %d × %d mm (the sheet keeps a %d mm edge); %s × %s mm is bigger.', $inW, $inH, self::SHEET_MARGIN, self::num($w), self::num($h)));
            }

            return;
        }
        // Either way round: a label printer takes a wide label as readily as a tall one.
        if (!(($w <= self::MAX_W && $h <= self::MAX_H) || ($w <= self::MAX_H && $h <= self::MAX_W))) {
            throw new InvalidArgumentException(sprintf('Labels can be up to %d × %d mm; %s × %s mm is bigger.', self::MAX_W, self::MAX_H, self::num($w), self::num($h)));
        }
    }

    private static function num(float $n): string
    {
        return rtrim(rtrim(number_format($n, 1, '.', ''), '0'), '.');
    }
}
