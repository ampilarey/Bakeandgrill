<?php

declare(strict_types=1);

namespace App\Domains\Posters\Spike;

use App\Domains\Posters\BrandCmyk;
use App\Domains\Posters\PaperSize;
use App\Domains\Posters\Pdf\OutputIntent;
use App\Domains\Posters\Pdf\PdfX4Document;
use App\Domains\Posters\Pdf\PosterFonts;

/**
 * The swatch card (docs/POSTER_PLAN.md § 6.6): an A5 with five press
 * mixes of each brand colour, the hex beside them, for the owner to hold
 * against the logo under the shop's lights and pick one per colour. The
 * picks go into the `poster_brand_cmyk` setting (BrandCmyk::SETTING).
 */
final class SwatchCard
{
    public static function render(OutputIntent $intent, string $printedOn = ''): string
    {
        $size = PaperSize::named('A5');
        $pdf = new PdfX4Document($intent, 'Brand colours: swatch card');
        $pdf->SetSubject('Pick one mix per colour under the shop lights');
        $pdf->addPosterPage($size);
        [$sx, $sy, $sw, $sh] = $size->safeBox();

        PosterFonts::use($pdf, 'ds', 18);
        $pdf->SetTextColorArray(BrandCmyk::TEXT_BLACK);
        $pdf->SetXY($sx, $sy);
        $pdf->Cell($sw, 9, 'Brand colours on your press', 0, 0, 'L');

        PosterFonts::use($pdf, 'j5', 8.5);
        $pdf->SetXY($sx, $sy + 10);
        $pdf->MultiCell($sw, 4, 'Hold this card against the logo under the shop lights. Circle the letter that matches best in each row, one per colour. ' . ($printedOn !== '' ? "Printed {$printedOn}. " : '') . 'Intent: ' . $intent->identifier . '.', 0, 'L');

        $y = $sy + 24;
        $swatch = 16.0;
        $gap = ($sw - 5 * $swatch) / 4;
        foreach (BrandCmyk::HEX as $role => $hex) {
            PosterFonts::use($pdf, 'j7', 10);
            $pdf->SetTextColorArray(BrandCmyk::TEXT_BLACK);
            $pdf->SetXY($sx, $y);
            $pdf->Cell($sw * 0.5, 5, BrandCmyk::LABELS[$role], 0, 0, 'L');
            PosterFonts::use($pdf, 'j5', 9);
            $pdf->SetXY($sx + $sw * 0.5, $y);
            $pdf->Cell($sw * 0.5, 5, strtoupper($hex), 0, 0, 'R');
            $y += 6;

            $i = 0;
            foreach (BrandCmyk::candidates($role) as $letter => $cmyk) {
                $x = $sx + $i * ($swatch + $gap);
                $pdf->SetFillColorArray($cmyk);
                $pdf->Rect($x, $y, $swatch, $swatch, 'F');
                // A hairline so a pale swatch still shows its edge.
                $pdf->SetDrawColorArray([0, 0, 0, 35]);
                $pdf->SetLineWidth(0.15);
                $pdf->Rect($x, $y, $swatch, $swatch, 'D');

                PosterFonts::use($pdf, 'j7', 9);
                $pdf->SetTextColorArray(BrandCmyk::TEXT_BLACK);
                $pdf->SetXY($x, $y + $swatch + 1);
                $pdf->Cell($swatch, 4, $letter, 0, 0, 'L');
                PosterFonts::use($pdf, 'j5', 6.5);
                $pdf->SetXY($x, $y + $swatch + 5);
                $pdf->Cell($swatch, 3.5, BrandCmyk::label($cmyk), 0, 0, 'L');
                $i++;
            }
            $y += $swatch + 10;
        }

        PosterFonts::use($pdf, 'j5', 7);
        $pdf->SetTextColorArray([0, 0, 0, 60]);
        $pdf->SetXY($sx, $sy + $sh - 8);
        $pdf->MultiCell($sw, 3.5, 'Values are C / M / Y / K in percent. A is the plain conversion; B lighter and more colour; C warmer; D deeper; E the round press mix. The picked letters are typed into Posters → Settings.', 0, 'L');

        return $pdf->bytes();
    }
}
