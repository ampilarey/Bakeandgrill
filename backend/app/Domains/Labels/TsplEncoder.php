<?php

declare(strict_types=1);

namespace App\Domains\Labels;

/**
 * Stickers as TSPL for a TSC-language label printer (round C, 2026-10-12),
 * which most thermal label printers sold with no brand name speak. Each
 * label is one job: the label's size in millimetres and the gap between
 * labels, the bitmap (a set bit is white in this language, so the rows are
 * inverted), and one print. Binary: it goes to the printer as bytes.
 */
final class TsplEncoder
{
    /** The gap between die-cut labels, in millimetres. */
    public const GAP_MM = 2.0;

    /**
     * @param list<array{w: int, h: int, bytes: int, rows: list<string>}> $labels from LabelRaster::page()
     */
    public static function encode(array $labels, float $labelWmm, float $labelHmm): string
    {
        $out = '';
        $size = sprintf('SIZE %s mm,%s mm', self::mm($labelWmm), self::mm($labelHmm));
        foreach ($labels as $label) {
            $data = '';
            foreach ($label['rows'] as $row) {
                $data .= ~$row;
            }
            $out .= $size . "\r\n"
                . sprintf('GAP %s mm,0 mm', self::mm(self::GAP_MM)) . "\r\n"
                . "DIRECTION 1\r\nCLS\r\n"
                . "BITMAP 0,0,{$label['bytes']},{$label['h']},0," . $data . "\r\n"
                . "PRINT 1,1\r\n";
        }

        return $out;
    }

    private static function mm(float $v): string
    {
        return rtrim(rtrim(number_format($v, 2, '.', ''), '0'), '.');
    }
}
