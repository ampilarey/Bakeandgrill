<?php

declare(strict_types=1);

namespace App\Domains\Labels;

/**
 * Where each part of a sticker lands, so a tap on the preview can open what
 * changes it (round 3 of the usability work, owner, 2026-10-13: "Still its v
 * confusing and not user friendly": tap the name, the dates, the logo).
 *
 * A design marks a part by pushing a marker piece before the pieces that
 * draw it (`LabelSpots::open('name')`) and `close()` after them. A marker is
 * not a piece: strip() drops them before anything renders (the web sheet,
 * the PDF and the thermal rasteriser read x and w from every piece they are
 * given), and spots() turns each run between a marker and the next into one
 * box in mm, the smallest that holds what was drawn: a rect or picture by
 * its box, a text by its ascent and descent at its size, a line by its
 * stroke. A part drawn in two places (the brand's logo and its name line)
 * gives two boxes with the same key; the Admin opens the same sheet from
 * either.
 */
final class LabelSpots
{
    /** The marker's type, never seen by a renderer. */
    public const MARK = 'field';

    /**
     * The parts a sticker can carry, as the Admin names them. `batch_qr` is
     * the pack page's code in the header; the complaints QR is the footer's.
     */
    public const KEYS = ['brand', 'heading', 'batch_qr', 'pack', 'name', 'promo', 'packed', 'photo', 'barcode', 'ingredients', 'how_to_use', 'nutrition', 'icons', 'note', 'dates', 'batch', 'qty', 'price', 'storage', 'footer'];

    /** @return array{t: string, key: string} */
    public static function open(string $key): array
    {
        return ['t' => self::MARK, 'key' => $key];
    }

    /** @return array{t: string, key: null} */
    public static function close(): array
    {
        return ['t' => self::MARK, 'key' => null];
    }

    /**
     * A spot with a box of its own, for a part that shares a line with
     * another (the batch and the quantity on the compact sticker are two
     * texts across the same width): the pieces that follow are not
     * collected, so the next open() starts the next run.
     *
     * @return array{t: string, key: string, box: array{0: float, 1: float, 2: float, 3: float}}
     */
    public static function at(string $key, float $x, float $y, float $w, float $h): array
    {
        return ['t' => self::MARK, 'key' => $key, 'box' => [$x, $y, $w, $h]];
    }

    /**
     * The pieces without their markers: what the renderers get.
     *
     * @param list<array<string, mixed>> $pieces
     * @return list<array<string, mixed>>
     */
    public static function strip(array $pieces): array
    {
        return array_values(array_filter($pieces, fn (array $p) => ($p['t'] ?? null) !== self::MARK));
    }

    /**
     * One box per marked run, in the order the design drew them, in mm from
     * the sticker's top-left corner. A run with nothing drawn in it (a part
     * whose text was empty) gives no box.
     *
     * @param list<array<string, mixed>> $pieces with their markers
     * @return list<array{key: string, x: float, y: float, w: float, h: float}>
     */
    public static function spots(array $pieces): array
    {
        $out = [];
        $key = null;
        $box = null;
        $flush = function () use (&$out, &$key, &$box): void {
            if ($key !== null && $box !== null) {
                [$x1, $y1, $x2, $y2] = $box;
                $out[] = ['key' => $key, 'x' => round($x1, 2), 'y' => round($y1, 2), 'w' => round($x2 - $x1, 2), 'h' => round($y2 - $y1, 2)];
            }
            $box = null;
        };
        foreach ($pieces as $p) {
            if (($p['t'] ?? null) === self::MARK) {
                $flush();
                if (isset($p['box'])) {
                    [$bx, $by, $bw, $bh] = $p['box'];
                    $out[] = ['key' => (string) $p['key'], 'x' => round($bx, 2), 'y' => round($by, 2), 'w' => round($bw, 2), 'h' => round($bh, 2)];
                    $key = null;
                    continue;
                }
                $key = $p['key'] ?? null;
                continue;
            }
            if ($key === null) {
                continue;
            }
            $b = self::box($p);
            if ($b === null) {
                continue;
            }
            $box = $box === null ? $b : [min($box[0], $b[0]), min($box[1], $b[1]), max($box[2], $b[2]), max($box[3], $b[3])];
        }
        $flush();

        return $out;
    }

    /**
     * The box a piece covers: x1, y1, x2, y2.
     *
     * @param array<string, mixed> $p
     * @return array{0: float, 1: float, 2: float, 3: float}|null
     */
    private static function box(array $p): ?array
    {
        $x = (float) ($p['x'] ?? 0.0);
        $w = (float) ($p['w'] ?? 0.0);
        switch ($p['t'] ?? '') {
            case 'rect':
            case 'img':
                $y = (float) ($p['y'] ?? 0.0);

                return [$x, $y, $x + $w, $y + (float) ($p['h'] ?? 0.0)];
            case 'line':
                $y = (float) ($p['y'] ?? 0.0);
                $sw = max(0.3, (float) ($p['sw'] ?? 0.3));

                return [$x, $y - $sw, $x + $w, $y + $sw];
            case 'text':
                if (trim((string) ($p['text'] ?? '')) === '') {
                    return null;
                }
                $pt = (float) ($p['pt'] ?? 0.0);
                $font = (string) ($p['font'] ?? 'j4');
                $base = (float) ($p['base'] ?? 0.0);

                return [$x, $base - LabelText::ascent($font) * $pt * LabelText::PT, $x + $w, $base + LabelText::descent($font) * $pt * LabelText::PT];
        }

        return null;
    }
}
