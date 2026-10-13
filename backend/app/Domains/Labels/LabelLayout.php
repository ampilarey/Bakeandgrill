<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\CustomLabel;
use App\Models\Item;

/**
 * The drag designer (round 8 of the usability work, owner, 2026-10-13: "a
 * drag-and-drop designer on the sticker: move and resize text and pictures,
 * with Back to automatic").
 *
 * A design still places every part itself; a product may keep, per design,
 * the parts the owner moved or resized by hand on the preview: a shift in
 * mm and a scale, keyed by the part's spot (`label_layout`, JSON:
 * `{"full": {"name": {"dx": 3, "dy": -2, "s": 1.2}}}`). apply() moves and
 * scales the pieces of each marked run (LabelSpots) before the markers are
 * stripped, so the web sheet, the PDF, the raster and the spots all see the
 * moved part. A part with a box of its own (LabelSpots::at) has no run, so
 * it stays where the design put it; the Admin shows it fixed. Back to
 * automatic forgets a design's overrides.
 */
final class LabelLayout
{
    /** The designs a part can be moved on; a wrap-around label is arranged by its strips instead. */
    public const DESIGNS = ['full', 'mini', 'small', 'round'];

    public const MAX_MM = 300.0;

    public const MIN_SCALE = 0.5;

    public const MAX_SCALE = 2.0;

    /**
     * @return array<string, array<string, array{dx: float, dy: float, s: float}>> design → spot → override
     */
    public static function of(Item|CustomLabel $product): array
    {
        return self::clean($product->label_layout);
    }

    /**
     * A typed or kept layout, tidied: known designs and spots only, shifts
     * to 0.1 mm within ±MAX_MM, the scale within its bounds, and a part
     * neither moved nor scaled left out. Nothing kept gives [].
     *
     * @return array<string, array<string, array{dx: float, dy: float, s: float}>>
     */
    public static function clean(mixed $raw): array
    {
        if (is_string($raw)) {
            $raw = json_decode($raw, true);
        }
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach (self::DESIGNS as $design) {
            $parts = $raw[$design] ?? null;
            if (!is_array($parts)) {
                continue;
            }
            foreach (LabelSpots::KEYS as $key) {
                $o = $parts[$key] ?? null;
                if (!is_array($o)) {
                    continue;
                }
                $dx = self::mm($o['dx'] ?? 0);
                $dy = self::mm($o['dy'] ?? 0);
                $s = self::scale($o['s'] ?? 1);
                if ($dx === 0.0 && $dy === 0.0 && $s === 1.0) {
                    continue;
                }
                $out[$design][$key] = ['dx' => $dx, 'dy' => $dy, 's' => $s];
            }
        }

        return $out;
    }

    /**
     * The validation of a typed layout under `$key` (a label's `label_layout`,
     * a template's `fields.label_layout`).
     *
     * @return array<string, string>
     */
    public static function rules(string $key = 'label_layout'): array
    {
        return [
            $key => 'sometimes|nullable|array',
            "$key.*" => 'array',
            "$key.*.*" => 'array',
            "$key.*.*.dx" => 'sometimes|numeric|min:-' . self::MAX_MM . '|max:' . self::MAX_MM,
            "$key.*.*.dy" => 'sometimes|numeric|min:-' . self::MAX_MM . '|max:' . self::MAX_MM,
            "$key.*.*.s" => 'sometimes|numeric|min:' . self::MIN_SCALE . '|max:' . self::MAX_SCALE,
        ];
    }

    /**
     * A design's pieces, still marked, with each overridden run moved and
     * scaled: the scale is about the run's top-left corner, then the shift.
     *
     * @param list<array<string, mixed>> $pieces with their markers
     * @param array<string, array{dx: float, dy: float, s: float}> $overrides spot → override, for this design
     * @return list<array<string, mixed>>
     */
    public static function apply(array $pieces, array $overrides): array
    {
        if ($overrides === []) {
            return $pieces;
        }
        $out = [];
        $run = [];
        $key = null;
        $flush = function () use (&$out, &$run, &$key, $overrides): void {
            if ($key !== null && isset($overrides[$key]) && $run !== []) {
                $run = self::transform($run, $overrides[$key]);
            }
            foreach ($run as $p) {
                $out[] = $p;
            }
            $run = [];
        };
        foreach ($pieces as $p) {
            if (($p['t'] ?? null) === LabelSpots::MARK) {
                $flush();
                $out[] = $p;
                // A marker with a box of its own collects nothing; the next open() starts the next run.
                $key = isset($p['box']) ? null : ($p['key'] ?? null);
                continue;
            }
            if ($key === null) {
                $out[] = $p;
                continue;
            }
            $run[] = $p;
        }
        $flush();

        return $out;
    }

    /**
     * @param list<array<string, mixed>> $run
     * @param array{dx: float, dy: float, s: float} $o
     * @return list<array<string, mixed>>
     */
    private static function transform(array $run, array $o): array
    {
        $dx = (float) ($o['dx'] ?? 0.0);
        $dy = (float) ($o['dy'] ?? 0.0);
        $s = (float) ($o['s'] ?? 1.0);
        $box = null;
        foreach ($run as $p) {
            $b = LabelSpots::box($p);
            if ($b !== null) {
                $box = $box === null ? $b : [min($box[0], $b[0]), min($box[1], $b[1]), max($box[2], $b[2]), max($box[3], $b[3])];
            }
        }
        $ox = $box[0] ?? 0.0;
        $oy = $box[1] ?? 0.0;
        $sx = fn (float $x): float => round($ox + ($x - $ox) * $s + $dx, 3);
        $sy = fn (float $y): float => round($oy + ($y - $oy) * $s + $dy, 3);
        foreach ($run as &$p) {
            $p['x'] = $sx((float) ($p['x'] ?? 0.0));
            if (isset($p['w'])) {
                $p['w'] = round((float) $p['w'] * $s, 3);
            }
            switch ($p['t'] ?? '') {
                case 'text':
                    $p['base'] = $sy((float) ($p['base'] ?? 0.0));
                    $p['pt'] = round((float) ($p['pt'] ?? 0.0) * $s, 3);
                    break;
                case 'rect':
                case 'img':
                    $p['y'] = $sy((float) ($p['y'] ?? 0.0));
                    $p['h'] = round((float) ($p['h'] ?? 0.0) * $s, 3);
                    if (isset($p['r'])) {
                        $p['r'] = round((float) $p['r'] * $s, 3);
                    }
                    if (isset($p['sw'])) {
                        $p['sw'] = round((float) $p['sw'] * $s, 3);
                    }
                    break;
                case 'line':
                    $p['y'] = $sy((float) ($p['y'] ?? 0.0));
                    if (isset($p['sw'])) {
                        $p['sw'] = round((float) $p['sw'] * $s, 3);
                    }
                    break;
            }
        }
        unset($p);

        return $run;
    }

    private static function mm(mixed $v): float
    {
        $v = is_numeric($v) ? (float) $v : 0.0;

        return round(max(-self::MAX_MM, min(self::MAX_MM, $v)), 1);
    }

    private static function scale(mixed $v): float
    {
        $v = is_numeric($v) ? (float) $v : 1.0;

        return round(max(self::MIN_SCALE, min(self::MAX_SCALE, $v)), 2);
    }
}
