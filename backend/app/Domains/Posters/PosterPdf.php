<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Domains\Posters\Pdf\OutputIntent;
use App\Domains\Posters\Pdf\PdfX4Document;
use App\Domains\Posters\Pdf\PosterFonts;
use App\Domains\Posters\Spike\WhiteMask;
use App\Support\ThaanaVisual;
use BaconQrCode\Common\ErrorCorrectionLevel;
use BaconQrCode\Encoder\Encoder;

/**
 * Draws a piece list onto a PDF/X-4 page. One sheet can hold several
 * copies (imposition); a table-card set is one sheet per table.
 */
final class PosterPdf
{
    /** @var array<string, array{jpeg: string, w: int, h: int}> */
    private static array $photos = [];

    /**
     * @param list<list<array{ox: float, oy: float, scale: float, rotate: int, built: array<string, mixed>}>> $sheets
     * @param array{mirror?: bool, spots?: array{white?: string, gloss?: string}} $options
     * @return array{pdf: string, masks: list<array{rects: list<array{0: float, 1: float, 2: float, 3: float}>, paths: list<list<array{0: string, 1: list<float>}>>}>, gloss: list<array{rects: list<array{0: float, 1: float, 2: float, 3: float}>, paths: list<list<array{0: string, 1: list<float>}>>}>}
     */
    public static function render(PaperSize $page, array $sheets, string $title, array $options = []): array
    {
        $pdf = new PdfX4Document(OutputIntent::fromConfig(), $title);
        $pdf->SetSubject($title);
        $spots = is_array($options['spots'] ?? null) ? $options['spots'] : [];
        $whiteName = trim((string) ($spots['white'] ?? ''));
        $glossName = trim((string) ($spots['gloss'] ?? ''));
        if ($whiteName !== '') {
            $pdf->AddSpotColor($whiteName, 0, 0, 0, 0);
        }
        if ($glossName !== '') {
            $pdf->AddSpotColor($glossName, 0, 0, 0, 0);
        }
        $masks = [];
        $gloss = [];
        foreach ($sheets as $copies) {
            $pdf->addPosterPage($page);
            $mirrored = ($options['mirror'] ?? false) === true;
            if ($mirrored) {
                $pdf->StartTransform();
                $pdf->MirrorH($page->bleedWidth() / 2);
            }
            $ink = ['rects' => [], 'paths' => []];
            $glossInk = ['rects' => [], 'paths' => []];
            foreach ($copies as $copy) {
                self::drawCopy($pdf, $page, $copy, $ink, $glossInk);
            }
            self::paintSpots($pdf, $ink, $glossInk, $whiteName, $glossName);
            if ($mirrored) {
                $pdf->StopTransform();
            }
            $masks[] = $ink;
            $gloss[] = $glossInk;
        }

        return ['pdf' => $pdf->bytes(), 'masks' => $masks, 'gloss' => $gloss];
    }

    /**
     * Spot white under the ink, and spot gloss on type at 14 pt and up
     * plus the logo. QR is never glossed. Rects are choked like the mask.
     *
     * @param array{rects: list<array{0: float, 1: float, 2: float, 3: float}>, paths: list<list<array{0: string, 1: list<float>}>>} $ink
     * @param array{rects: list<array{0: float, 1: float, 2: float, 3: float}>, paths: list<list<array{0: string, 1: list<float>}>>} $gloss
     */
    private static function paintSpots(PdfX4Document $pdf, array $ink, array $gloss, string $whiteName, string $glossName): void
    {
        if ($whiteName === '' && $glossName === '') {
            return;
        }
        $pdf->setOverprint(false, true, 0);
        $c = WhiteMask::CHOKE_MM;
        $paint = static function (PdfX4Document $pdf, array $layer) use ($c): void {
            foreach ($layer['rects'] as [$x, $y, $w, $h]) {
                if ($w <= 2 * $c || $h <= 2 * $c) {
                    continue;
                }
                $pdf->Rect($x + $c, $y + $c, $w - 2 * $c, $h - 2 * $c, 'F');
            }
            foreach ($layer['paths'] as $ops) {
                $pdf->fillPathCurrent($ops);
            }
        };
        if ($whiteName !== '') {
            $pdf->setSpotColor('fill', $whiteName, 100);
            $paint($pdf, $ink);
        }
        if ($glossName !== '') {
            $pdf->setSpotColor('fill', $glossName, 100);
            $paint($pdf, $gloss);
        }
    }

    /**
     * A mask PDF with one page per sheet. Gloss uses the same shape, with
     * only the type, logo and QR (not the photograph or the background).
     *
     * @param list<array{rects: list<array{0: float, 1: float, 2: float, 3: float}>, paths: list<list<array{0: string, 1: list<float>}>>}> $pages
     */
    public static function mask(PaperSize $page, array $pages, string $title): string
    {
        $pdf = new PdfX4Document(OutputIntent::fromConfig(), $title);
        $pdf->SetSubject($title);
        $c = WhiteMask::CHOKE_MM;
        foreach ($pages as $ink) {
            $pdf->addPosterPage($page);
            $pdf->SetFillColorArray(BrandCmyk::TEXT_BLACK);
            foreach ($ink['rects'] as [$x, $y, $w, $h]) {
                if ($w <= 2 * $c || $h <= 2 * $c) {
                    continue;
                }
                $pdf->Rect($x + $c, $y + $c, $w - 2 * $c, $h - 2 * $c, 'F');
            }
            foreach ($ink['paths'] as $ops) {
                $pdf->fillPath($ops, BrandCmyk::TEXT_BLACK);
            }
        }

        return $pdf->bytes();
    }

    /**
     * @param array{ox: float, oy: float, scale: float, rotate: int, built: array<string, mixed>} $copy
     * @param array{rects: list<array{0: float, 1: float, 2: float, 3: float}>, paths: list<list<array{0: string, 1: list<float>}>>} $ink
     * @param array{rects: list<array{0: float, 1: float, 2: float, 3: float}>, paths: list<list<array{0: string, 1: list<float>}>>} $gloss
     */
    private static function drawCopy(PdfX4Document $pdf, PaperSize $page, array $copy, array &$ink, array &$gloss): void
    {
        $built = $copy['built'];
        $scale = (float) $copy['scale'];
        $ox = (float) $copy['ox'];
        $oy = (float) $copy['oy'];
        $rotated = ((int) $copy['rotate']) === 180;
        if ($rotated) {
            $pdf->StartTransform();
            $pdf->Rotate(180, $ox + ((float) $built['w']) * $scale / 2, $oy + ((float) $built['h']) * $scale / 2);
        }
        $bg = $built['background'];
        $pdf->SetFillColorArray($bg);
        $pdf->Rect($ox, $oy, ((float) $built['w']) * $scale, ((float) $built['h']) * $scale, 'F');
        self::inkRect($ink, $ox, $oy, ((float) $built['w']) * $scale, ((float) $built['h']) * $scale, true);

        foreach ($built['pieces'] as $piece) {
            if (($piece['type'] ?? '') === 'skip') {
                continue;
            }
            $x = $ox + (float) $piece['x'] * $scale;
            $y = $oy + (float) $piece['y'] * $scale;
            $w = (float) $piece['w'] * $scale;
            $h = (float) $piece['h'] * $scale;
            match ($piece['type']) {
                'rect' => self::rect($pdf, $x, $y, $w, $h, $piece['cmyk']),
                'photo' => self::photo($pdf, $page, $x, $y, $w, $h, (string) $piece['path']),
                'text' => self::text($pdf, $x, $y, $w, $h, $piece, $scale),
                'qr' => self::qr($pdf, (string) ($piece['url'] ?? ''), $x, $y, min($w, $h)),
                'logo' => self::logo($pdf, $x, $y, $w, (string) ($piece['colourway'] ?? 'light'), $ink, $gloss),
                default => null,
            };
            if (in_array($piece['type'], ['rect', 'photo', 'text', 'qr'], true)) {
                self::inkRect($ink, $x, $y, $w, $h, (bool) ($piece['bleed'] ?? false));
            }
            $pt = (float) ($piece['pt'] ?? 0);
            if ($piece['type'] === 'text' && $pt >= 14) {
                self::inkRect($gloss, $x, $y, $w, $h, false);
            }
        }
        if ($rotated) {
            $pdf->StopTransform();
        }
    }

    /** @param array{0: float, 1: float, 2: float, 3: float} $cmyk */
    private static function rect(PdfX4Document $pdf, float $x, float $y, float $w, float $h, array $cmyk): void
    {
        $pdf->SetFillColorArray($cmyk);
        $pdf->Rect($x, $y, $w, $h, 'F');
    }

    private static function photo(PdfX4Document $pdf, PaperSize $page, float $x, float $y, float $w, float $h, string $path): void
    {
        $ppi = ['A5' => 150, 'A4' => 200, 'A3' => 150, 'A2' => 120][$page->name] ?? 120;
        $key = $path . '|' . (int) $w . '|' . (int) $h . '|' . $ppi;
        if (!isset(self::$photos[$key])) {
            self::$photos[$key] = PosterPhoto::cover($path, $w, $h, $ppi);
        }
        $jpeg = self::$photos[$key]['jpeg'];
        $pdf->Image('@' . $jpeg, $x, $y, $w, $h, 'JPEG', '', '', false, $ppi, '', false, false, 0, false, false, false);
    }

    /** @param array<string, mixed> $piece */
    private static function text(PdfX4Document $pdf, float $x, float $y, float $w, float $h, array $piece, float $scale): void
    {
        $pt = (float) $piece['pt'] * $scale;
        $font = (string) ($piece['font'] ?? 'j5');
        PosterFonts::use($pdf, $font, $pt);
        $pdf->SetTextColorArray($piece['cmyk']);
        $text = (string) $piece['text'];
        if (($piece['dv'] ?? false) === true) {
            $text = ThaanaVisual::order($text, true);
        }
        $align = ['left' => 'L', 'center' => 'C', 'right' => 'R'][(string) ($piece['align'] ?? 'left')] ?? 'L';
        $pdf->SetXY($x, $y);
        $pdf->MultiCell($w, $pt * 0.45, $text, 0, $align, false, 1, '', '', true, 0, false, true, $h, 'T', true);
        if (($piece['strike'] ?? false) === true) {
            $pdf->SetDrawColorArray($piece['cmyk']);
            $pdf->SetLineWidth(0.3);
            $pdf->Line($x, $y + $h / 2, $x + $w, $y + $h / 2);
        }
    }

    private static function qr(PdfX4Document $pdf, string $text, float $x, float $y, float $side): void
    {
        if ($text === '') {
            return;
        }
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

    /**
     * @param array{rects: list<array{0: float, 1: float, 2: float, 3: float}>, paths: list<list<array{0: string, 1: list<float>}>>} $ink
     * @param array{rects: list<array{0: float, 1: float, 2: float, 3: float}>, paths: list<list<array{0: string, 1: list<float>}>>} $gloss
     */
    private static function logo(PdfX4Document $pdf, float $x, float $y, float $w, string $colourway, array &$ink, array &$gloss): void
    {
        foreach (LogoVector::fromFile()->placed($x, $y, $w, $colourway) as $shape) {
            $pdf->fillPath($shape['ops'], $shape['cmyk']);
            $ink['paths'][] = $shape['ops'];
            $gloss['paths'][] = $shape['ops'];
        }
    }

    /**
     * @param array{rects: list<array{0: float, 1: float, 2: float, 3: float}>, paths: list<list<array{0: string, 1: list<float>}>>} $ink
     */
    private static function inkRect(array &$ink, float $x, float $y, float $w, float $h, bool $bleed): void
    {
        $c = $bleed ? WhiteMask::CHOKE_MM : 0.0;
        $ink['rects'][] = [$x - $c, $y - $c, $w + 2 * $c, $h + 2 * $c];
    }
}
