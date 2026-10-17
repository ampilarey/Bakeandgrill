<?php

declare(strict_types=1);

namespace App\Domains\Posters\Spike;

use App\Domains\Posters\BrandCmyk;
use App\Domains\Posters\LogoVector;
use App\Domains\Posters\PaperSize;
use App\Domains\Posters\Pdf\OutputIntent;
use App\Domains\Posters\Pdf\PdfX4Document;
use App\Domains\Posters\Pdf\PosterFonts;
use App\Domains\Posters\PosterPhoto;
use App\Support\ThaanaVisual;
use BaconQrCode\Common\ErrorCorrectionLevel;
use BaconQrCode\Encoder\Encoder;

/**
 * The Phase 0 poster (docs/POSTER_PLAN.md § 13): one `hero_photo` layout,
 * a full-bleed photo with a shaded panel, an English headline, a Dhivehi
 * line, a "From" price, the GST line, the vector logo and a QR, at any
 * A size. Everything is placed as a share of the trim so A3 and A2 come
 * from the same numbers.
 *
 * It is a spike, not the layout engine: Phase 1's PosterLayout takes the
 * slot and fit rules from PosterCardSpec. What this proves is the file:
 * page boxes, embedded fonts, CMYK text and shapes, an RGB photo with its
 * profile, the vector logo in brand CMYK, and the ink regions a white mask
 * is made from.
 */
final class HeroPoster
{
    /** Photo resolution the file is made at, by size (§ 6.1). */
    public const PPI = ['A5' => 300, 'A4' => 300, 'A3' => 150, 'A2' => 150];

    /**
     * @param array{
     *   eyebrow?: string, headline: string, headline_dv?: string, price?: string,
     *   gst_line?: string, gst_line_dv?: string, qr_url?: string, photo?: string
     * } $data photo is a file path; when missing a stand-in is drawn
     */
    public function __construct(
        private readonly PaperSize $size,
        private readonly array $data,
        private readonly OutputIntent $intent,
    ) {}

    /**
     * @return array{pdf: string, ink: array{rects: list<array{0: float, 1: float, 2: float, 3: float}>, paths: list<list<array{0: string, 1: list<float>}>>}, photo: array{w: int, h: int, ppi: float, source_w: int, source_h: int}, fonts: list<string>}
     */
    public function render(): array
    {
        $size = $this->size;
        $pdf = new PdfX4Document($this->intent, (string) ($this->data['headline'] ?? 'Poster'));
        $pdf->SetSubject('Poster, ' . $size->name . ($size->landscape ? ' landscape' : ''));
        $pdf->addPosterPage($size);

        $W = $size->bleedWidth();
        $H = $size->bleedHeight();
        $s = $size->trimWidth / 297.0;
        [$safeX, $safeY, $safeW, $safeH] = $size->safeBox();
        $ink = ['rects' => [], 'paths' => []];

        // 1. The photo, full bleed, scaled once to the size's resolution.
        $ppi = self::PPI[$size->name];
        $photoPath = $this->data['photo'] ?? null;
        $tmp = null;
        if (!is_string($photoPath) || !is_file($photoPath)) {
            [$pw, $ph] = $size->pixelsAt($ppi);
            $tmp = tempnam(sys_get_temp_dir(), 'poster-photo-');
            file_put_contents($tmp, PosterPhoto::synthetic($pw, $ph));
            $photoPath = $tmp;
        }
        try {
            $photo = PosterPhoto::cover($photoPath, $W, $H, $ppi);
        } finally {
            if ($tmp !== null) {
                @unlink($tmp);
            }
        }
        $pdf->Image('@' . $photo['jpeg'], 0, 0, $W, $H, 'JPEG', '', '', false, $ppi, '', false, false, 0, false, false, false);
        $ink['rects'][] = [0.0, 0.0, $W, $H];

        // 2. The shaded panel the words sit on: rich black, 72 % over the photo.
        $panelTop = $H * 0.52;
        $pdf->setAlpha(0.72);
        $pdf->SetFillColorArray(BrandCmyk::RICH_BLACK);
        $pdf->Rect(0, $panelTop, $W, $H - $panelTop, 'F');
        $pdf->setAlpha(1.0);

        $x = $safeX;
        $textW = $safeW * 0.68;
        $y = $panelTop + 12 * $s;

        // 3. Eyebrow.
        $eyebrow = trim((string) ($this->data['eyebrow'] ?? ''));
        if ($eyebrow !== '') {
            PosterFonts::use($pdf, 'j7', 14 * $s);
            $pdf->SetTextColorArray(BrandCmyk::chosen('amber'));
            $pdf->SetXY($x, $y);
            $pdf->Cell($textW, 7 * $s, mb_strtoupper($eyebrow), 0, 0, 'L');
            $y += 11 * $s;
        }

        // 4. Headline, shrunk to fit two lines at most.
        $headline = trim((string) $this->data['headline']);
        $pt = $this->fitPt($pdf, 'ds', $headline, 64 * $s, 36 * $s, $textW, 2);
        PosterFonts::use($pdf, 'ds', $pt);
        $pdf->SetTextColorArray(BrandCmyk::chosen('cream'));
        $pdf->SetXY($x, $y);
        $lineH = $pt * 0.3528 * 1.05;
        $pdf->MultiCell($textW, $lineH, $headline, 0, 'L', false, 1, $x, $y, true, 0, false, true, 0, 'T', false);
        $y = $pdf->GetY() + 4 * $s;

        // 5. The Dhivehi line, in visual order with the composed face.
        $dv = trim((string) ($this->data['headline_dv'] ?? ''));
        if ($dv !== '') {
            $dvPt = $this->fitPt($pdf, 'dvb', ThaanaVisual::order($dv, true), 30 * $s, 18 * $s, $textW, 1);
            PosterFonts::use($pdf, 'dvb', $dvPt);
            $pdf->SetXY($x, $y);
            $pdf->Cell($textW, $dvPt * 0.3528 * 1.4, ThaanaVisual::order($dv, true), 0, 0, 'L');
            $y += $dvPt * 0.3528 * 1.4 + 6 * $s;
        }

        // 6. The price: "From MVR x" for a dish with sizes (§ 4.4).
        $price = trim((string) ($this->data['price'] ?? ''));
        if ($price !== '') {
            PosterFonts::use($pdf, 'j8', 46 * $s);
            $pdf->SetTextColorArray(BrandCmyk::chosen('amber'));
            $pdf->SetXY($x, $y);
            $pdf->Cell($textW, 18 * $s, $price, 0, 0, 'L');
        }

        // 7. The logo, vector, bottom-left of the safe zone, cream wordmark on the dark panel.
        $logo = LogoVector::fromFile();
        $logoW = 38 * $s;
        $logoH = $logo->heightFor($logoW);
        $logoY = $safeY + $safeH - $logoH;
        foreach ($logo->placed($x, $logoY, $logoW, 'dark') as $shape) {
            $pdf->fillPath($shape['ops'], $shape['cmyk']);
            $ink['paths'][] = $shape['ops'];
        }

        // 8. The QR, bottom-right, on a paper-white tile with its quiet zone, modules in 100 % K.
        $qrUrl = trim((string) ($this->data['qr_url'] ?? ''));
        if ($qrUrl !== '') {
            $qrSide = 34 * $s;
            $qrX = $safeX + $safeW - $qrSide;
            $qrY = $safeY + $safeH - $qrSide;
            $this->qr($pdf, $qrUrl, $qrX, $qrY, $qrSide);
            $ink['rects'][] = [$qrX, $qrY, $qrSide, $qrSide];
        }

        // 9. The GST line, small, both languages, between the logo and the QR (§ 4.4).
        $gst = trim((string) ($this->data['gst_line'] ?? ''));
        $gstDv = trim((string) ($this->data['gst_line_dv'] ?? ''));
        if ($gst !== '' || $gstDv !== '') {
            $gx = $x + $logoW + 8 * $s;
            $gw = $safeX + $safeW - (34 * $s) - 8 * $s - $gx;
            $gy = $safeY + $safeH - 12 * $s;
            $pdf->SetTextColorArray(BrandCmyk::chosen('cream'));
            if ($gst !== '') {
                PosterFonts::use($pdf, 'j5', 11 * $s);
                $pdf->SetXY($gx, $gy - 6 * $s);
                $pdf->Cell($gw, 5 * $s, $gst, 0, 0, 'L');
            }
            if ($gstDv !== '') {
                PosterFonts::use($pdf, 'dv', 11 * $s);
                $pdf->SetXY($gx, $gy);
                $pdf->Cell($gw, 6 * $s, ThaanaVisual::order($gstDv, true), 0, 0, 'L');
            }
        }

        $used = array_values(array_unique(['j7', 'ds', 'dvb', 'j8', 'j5', 'dv']));

        return [
            'pdf' => $pdf->bytes(),
            'ink' => $ink,
            'photo' => ['w' => $photo['w'], 'h' => $photo['h'], 'ppi' => round($size->ppiOf($photo['w'], $photo['h']), 1), 'source_w' => $photo['source_w'], 'source_h' => $photo['source_h']],
            'fonts' => $used,
        ];
    }

    /** The largest size from $maxPt down to $minPt at which $text fits $widthMm in $lines lines. */
    private function fitPt(PdfX4Document $pdf, string $font, string $text, float $maxPt, float $minPt, float $widthMm, int $lines): float
    {
        for ($pt = $maxPt; $pt >= $minPt; $pt -= 1.0) {
            PosterFonts::use($pdf, $font, $pt);
            $w = (float) $pdf->GetStringWidth($text);
            if ($w <= $widthMm * $lines * 0.92) {
                return $pt;
            }
        }

        return $minPt;
    }

    private function qr(PdfX4Document $pdf, string $text, float $x, float $y, float $side): void
    {
        $matrix = Encoder::encode($text, ErrorCorrectionLevel::M(), Encoder::DEFAULT_BYTE_MODE_ENCODING)->getMatrix();
        $n = $matrix->getWidth();
        $quiet = 4;
        $cell = $side / ($n + 2 * $quiet);
        $pdf->SetFillColorArray(BrandCmyk::PAPER_WHITE);
        $pdf->RoundedRect($x, $y, $side, $side, $cell * 2, '1111', 'F');
        $pdf->SetFillColorArray(BrandCmyk::TEXT_BLACK);
        for ($r = 0; $r < $n; $r++) {
            for ($c = 0; $c < $n; $c++) {
                if ($matrix->get($c, $r) !== 1) {
                    continue;
                }
                $pdf->Rect($x + ($c + $quiet) * $cell, $y + ($r + $quiet) * $cell, $cell + 0.01, $cell + 0.01, 'F');
            }
        }
    }
}
