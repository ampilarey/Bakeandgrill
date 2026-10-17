<?php

declare(strict_types=1);

namespace App\Domains\Posters\Pdf;

use RuntimeException;
use TCPDF_FONTS;

/**
 * The label fonts for TCPDF (docs/POSTER_PLAN.md § 12.4).
 *
 * TCPDF reads a font through its own description files, made once from the
 * TTF (TCPDF_FONTS::addTTFfont). The TTFs are the ones the labels embed
 * from public/fonts/pdf; the made files go to storage (config
 * posters.font_cache) on first use, never into the repository. Every face
 * is open-licensed and embeddable (public/fonts/pdf/LICENSES.txt).
 *
 * Dhivehi uses the composed Noto Sans Thaana (letter + fili as one glyph,
 * scripts/thaana-composed-font.py) and is passed in visual order by
 * App\Support\ThaanaVisual::order($text, true), as the labels do.
 */
final class PosterFonts
{
    /** key → file under public/fonts/pdf */
    public const FILES = [
        'j4' => 'PlusJakartaSans-400.ttf',
        'j5' => 'PlusJakartaSans-500.ttf',
        'j7' => 'PlusJakartaSans-700.ttf',
        'j8' => 'PlusJakartaSans-800.ttf',
        'ds' => 'DMSerifDisplay-Regular.ttf',
        'dsi' => 'DMSerifDisplay-Italic.ttf',
        'dv' => 'NotoSansThaana-Regular-composed.ttf',
        'dvb' => 'NotoSansThaana-Bold-composed.ttf',
        'sym' => 'LabelSymbols.ttf',
    ];

    /** @var array<string, array{0: string, 1: string}> key → [TCPDF font name, description file] */
    private static array $made = [];

    /**
     * The TCPDF font name and its description file for a key, converting
     * the TTF on first use.
     *
     * @return array{0: string, 1: string}
     */
    public static function font(string $key): array
    {
        if (isset(self::$made[$key])) {
            return self::$made[$key];
        }
        if (!isset(self::FILES[$key])) {
            throw new RuntimeException("Unknown poster font \"{$key}\".");
        }
        $ttf = public_path('fonts/pdf/' . self::FILES[$key]);
        if (!is_file($ttf)) {
            throw new RuntimeException("Poster font file missing: {$ttf}");
        }
        $dir = rtrim((string) config('posters.font_cache', storage_path('app/posters/fonts')), '/') . '/';
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("Cannot make the poster font cache: {$dir}");
        }
        $name = TCPDF_FONTS::addTTFfont($ttf, 'TrueTypeUnicode', '', 32, $dir);
        if (!is_string($name) || $name === '') {
            throw new RuntimeException("TCPDF could not read {$ttf}.");
        }

        return self::$made[$key] = [$name, $dir . $name . '.php'];
    }

    /** Set a font on a document by key. */
    public static function use(PdfX4Document $pdf, string $key, float $pt): void
    {
        [$name, $file] = self::font($key);
        $pdf->SetFont($name, '', $pt, $file, 'default', true);
    }
}
