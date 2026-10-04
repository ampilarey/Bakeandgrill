<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Support\ThaanaVisual;

/**
 * The label fonts, and how wide a run of text is in them, so a name can be
 * sized to its box and a Dhivehi line broken before it is ordered for the PDF.
 *
 * Each face is its own family ("LabelJ7" and so on) rather than one family
 * with weights: dompdf only tells normal from bold, and these labels use four
 * weights of Plus Jakarta Sans.
 */
final class LabelText
{
    /**
     * key => [family, PDF file under public/, web file under public/, ascent, descent]
     * (ascent and descent as a share of the size, from the fonts' hhea tables).
     *
     * @var array<string, array{0: string, 1: string, 2: string, 3: float, 4: float}>
     */
    public const FONTS = [
        'j4' => ['LabelJ4', 'fonts/pdf/PlusJakartaSans-400.ttf', 'fonts/plus-jakarta-sans-400.woff2', 1.038, 0.222],
        'j5' => ['LabelJ5', 'fonts/pdf/PlusJakartaSans-500.ttf', 'fonts/plus-jakarta-sans-500.woff2', 1.038, 0.222],
        'j7' => ['LabelJ7', 'fonts/pdf/PlusJakartaSans-700.ttf', 'fonts/plus-jakarta-sans-700.woff2', 1.038, 0.222],
        'j8' => ['LabelJ8', 'fonts/pdf/PlusJakartaSans-800.ttf', 'fonts/plus-jakarta-sans-800.woff2', 1.038, 0.222],
        'ds' => ['LabelDS', 'fonts/pdf/DMSerifDisplay-Regular.ttf', 'fonts/dm-serif-display-regular.woff2', 1.036, 0.335],
        'dsi' => ['LabelDSI', 'fonts/pdf/DMSerifDisplay-Italic.ttf', 'fonts/dm-serif-display-italic.woff2', 1.036, 0.335],
        'dv' => ['LabelDV', 'fonts/a_faruma.ttf', 'fonts/a_faruma.woff2', 1.139, 0.472],
    ];

    public const PT = 0.3528;

    /**
     * dompdf sets a line's baseline at this × line-height × (ascent + descent)
     * below the line top, for every font tried (Plus Jakarta Sans, DM Serif
     * Display, Faruma, 10 and 20pt); browsers set it at the ascent.
     */
    public const PDF_BASELINE_K = 0.88;

    public static function widthMm(string $text, float $pt, string $font): float
    {
        return ThaanaVisual::widthMm($text, $pt, self::file($font));
    }

    /** The largest size from $maxPt down to $minPt at which $text fits $widthMm. */
    public static function fitPt(string $text, string $font, float $widthMm, float $maxPt, float $minPt): float
    {
        $pt = $maxPt;
        while ($pt > $minPt && self::widthMm($text, $pt, $font) > $widthMm) {
            $pt -= 0.25;
        }

        return max($minPt, round($pt, 2));
    }

    /** @return list<string> */
    public static function wrap(string $text, float $pt, float $widthMm, string $font): array
    {
        return ThaanaVisual::wrap($text, $pt, $widthMm, self::file($font));
    }

    public static function ascent(string $font): float
    {
        return self::FONTS[$font][3] ?? 1.0;
    }

    public static function descent(string $font): float
    {
        return self::FONTS[$font][4] ?? 0.25;
    }

    public static function file(string $font): string
    {
        if ($font === 'dv') {
            return \App\Domains\Content\DhivehiFont::pdfFile() ?? public_path(self::FONTS['dv'][1]);
        }

        return public_path(self::FONTS[$font][1] ?? self::FONTS['j4'][1]);
    }
}
