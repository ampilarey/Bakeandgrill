<?php

declare(strict_types=1);

namespace App\Domains\Posters\Spike;

use App\Domains\Posters\BrandCmyk;
use App\Domains\Posters\PaperSize;
use App\Domains\Posters\Pdf\OutputIntent;
use App\Domains\Posters\Pdf\PdfX4Document;

/**
 * The white-ink mask for a poster (docs/POSTER_PLAN.md § 6.3): a second
 * file with the same page boxes, black wherever ink goes, nothing where
 * the board stays see-through. Every UV RIP can take a mask, whatever it
 * calls its white channel; the named spot layer inside the one file waits
 * for a shop that asks for it (Phase 2).
 *
 * The mask is choked: each region drawn CHOKE_MM smaller than the artwork
 * so no white shows at an edge (§ 14, "White choke 0.2 mm").
 */
final class WhiteMask
{
    public const CHOKE_MM = 0.2;

    /**
     * @param array{rects: list<array{0: float, 1: float, 2: float, 3: float}>, paths: list<list<array{0: string, 1: list<float>}>>} $ink
     */
    public static function render(PaperSize $size, array $ink, OutputIntent $intent, string $title = 'White mask'): string
    {
        $pdf = new PdfX4Document($intent, $title);
        $pdf->SetSubject('White ink mask: black is where white ink goes');
        $pdf->addPosterPage($size);
        $pdf->SetFillColorArray(BrandCmyk::TEXT_BLACK);
        $c = self::CHOKE_MM;
        foreach ($ink['rects'] as [$x, $y, $w, $h]) {
            if ($w <= 2 * $c || $h <= 2 * $c) {
                continue;
            }
            $pdf->Rect($x + $c, $y + $c, $w - 2 * $c, $h - 2 * $c, 'F');
        }
        // Paths are too small for a geometric choke to matter at 0.2 mm and are drawn as they are.
        foreach ($ink['paths'] as $ops) {
            $pdf->fillPath($ops, BrandCmyk::TEXT_BLACK);
        }

        return $pdf->bytes();
    }
}
