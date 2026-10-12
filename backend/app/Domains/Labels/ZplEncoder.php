<?php

declare(strict_types=1);

namespace App\Domains\Labels;

/**
 * Stickers as ZPL for a Zebra-language label printer (round C, 2026-10-12).
 * Each label is one format: the label's size in dots, then the bitmap as a
 * ^GF graphic field in the language's own run-length form (a count letter
 * before a repeated hex digit, `,` for a row that ends white, `!` for one
 * that ends black, `:` for a row that repeats the last), which keeps a
 * mostly white label to a few kilobytes.
 */
final class ZplEncoder
{
    /**
     * @param list<array{w: int, h: int, bytes: int, rows: list<string>}> $labels from LabelRaster::page()
     */
    public static function encode(array $labels): string
    {
        $out = '';
        foreach ($labels as $label) {
            $total = $label['bytes'] * $label['h'];
            $out .= "^XA\n^PW{$label['w']}\n^LL{$label['h']}\n^LH0,0\n^FO0,0^GFA,{$total},{$total},{$label['bytes']},\n"
                . self::compress($label['rows'], $label['bytes'])
                . "^FS\n^XZ\n";
        }

        return $out;
    }

    /**
     * The rows as ZPL's compressed hex.
     *
     * @param list<string> $rows packed bytes, 1 = black
     */
    public static function compress(array $rows, int $bytes): string
    {
        $out = '';
        $last = null;
        foreach ($rows as $row) {
            $hex = strtoupper(bin2hex($row));
            if ($hex === $last) {
                $out .= ':';
                continue;
            }
            $last = $hex;
            $out .= self::compressRow($hex);
        }

        return $out . "\n";
    }

    /** One row's hex, runs counted: "GF" is one F, "gF" twenty, "zYF" four hundred and nineteen. */
    private static function compressRow(string $hex): string
    {
        $n = strlen($hex);
        // A row that ends in white or black is cut short with , or !.
        $trim = rtrim($hex, '0');
        $tail = ',';
        if ($trim === '') {
            return ',';
        }
        $alt = rtrim($hex, 'F');
        if (strlen($alt) < strlen($trim)) {
            $trim = $alt;
            $tail = '!';
        }
        if (strlen($trim) === $n) {
            $tail = '';
        }
        $out = '';
        $len = strlen($trim);
        $i = 0;
        while ($i < $len) {
            $ch = $trim[$i];
            $j = $i;
            while ($j < $len && $trim[$j] === $ch) {
                $j++;
            }
            $out .= self::count($j - $i) . $ch;
            $i = $j;
        }

        return $out . $tail;
    }

    /** The letters ZPL puts before a repeated digit: G–Y for 1–19, g–z for 20–400 in twenties. */
    private static function count(int $n): string
    {
        if ($n === 1) {
            return '';
        }
        $out = '';
        while ($n >= 400) {
            $out .= 'z';
            $n -= 400;
        }
        if ($n >= 20) {
            $out .= chr(ord('g') + intdiv($n, 20) - 1);
            $n %= 20;
        }
        if ($n >= 1) {
            $out .= chr(ord('G') + $n - 1);
        }

        return $out;
    }
}
