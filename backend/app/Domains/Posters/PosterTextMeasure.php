<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Domains\Posters\Pdf\OutputIntent;
use App\Domains\Posters\Pdf\PdfX4Document;
use App\Domains\Posters\Pdf\PosterFonts;
use App\Support\ThaanaVisual;

/**
 * How wide a line comes out in a poster font, from the same TrueType
 * metrics the print file uses, so a template's shrink-to-fit and the
 * preview agree with the PDF. One measuring document per request.
 */
final class PosterTextMeasure
{
    private static ?PdfX4Document $pdf = null;

    /**
     * The width in millimetres of $text set in $font at $pt with
     * $trackingMm between letters. Dhivehi is measured in visual order with
     * the composed face, as it is drawn.
     */
    public static function width(string $text, string $font, float $pt, float $trackingMm = 0.0, bool $dv = false): float
    {
        if ($text === '') {
            return 0.0;
        }
        $pdf = self::document();
        PosterFonts::use($pdf, $font, $pt);
        $pdf->setFontSpacing($trackingMm);
        $width = (float) $pdf->GetStringWidth($dv ? ThaanaVisual::order($text, true) : $text);
        $pdf->setFontSpacing(0);

        return $width;
    }

    /** The font's ascent above the baseline at $pt, in millimetres. */
    public static function ascent(string $font, float $pt): float
    {
        $pdf = self::document();
        PosterFonts::use($pdf, $font, $pt);

        return (float) $pdf->getFontAscent($pdf->getFontFamily(), '', $pt);
    }

    /** The font's descent below the baseline at $pt, in millimetres. */
    public static function descent(string $font, float $pt): float
    {
        $pdf = self::document();
        PosterFonts::use($pdf, $font, $pt);

        return (float) $pdf->getFontDescent($pdf->getFontFamily(), '', $pt);
    }

    private static function document(): PdfX4Document
    {
        return self::$pdf ??= new PdfX4Document(OutputIntent::fromConfig(), 'measure');
    }
}
