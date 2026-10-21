<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Domains\Posters\Pdf\OutputIntent;
use App\Domains\Posters\Pdf\PdfX4Document;
use App\Domains\Posters\Pdf\PosterFonts;
use App\Models\Poster;

/**
 * The one-page spec that goes in the ZIP with the print files
 * (docs/POSTER_PLAN.md § 9): what to print, on what, and what the white
 * and gloss mean, in words.
 */
final class PosterSpec
{
    /** @param array<string, mixed> $job */
    public static function render(Poster $poster, array $job, array $preflight): string
    {
        $size = PaperSize::named('A4');
        $pdf = new PdfX4Document(OutputIntent::fromConfig(), $poster->code() . ' spec');
        $pdf->SetSubject('Print specification');
        $pdf->addPosterPage($size);
        [$x, $y] = $size->safeBox();
        $w = $size->safeBox()[2];

        PosterFonts::use($pdf, 'ds', 22);
        $pdf->SetTextColorArray(BrandCmyk::TEXT_BLACK);
        $pdf->SetXY($x, $y);
        $pdf->Cell($w, 10, 'Print spec ' . $poster->code(), 0, 1, 'L');

        $purpose = PosterPurposes::get($poster->template_key);
        $sizes = array_map('strval', is_array($job['sizes'] ?? null) ? $job['sizes'] : (array) $poster->sizes);
        $screens = array_values(array_filter($sizes, static fn (string $s): bool => PaperSize::kindOf($s) === PaperSize::KIND_SCREEN));
        if ($screens !== [] && count($screens) === count($sizes)) {
            // A TV poster: the pictures and where they go, nothing about paper.
            $lines = [
                'Poster' => $poster->name,
                'Purpose' => $purpose['label'] ?? $poster->template_key,
                'Screens' => implode(', ', array_map(static fn (string $s): string => PaperSize::named($s)->label(), $screens)),
                'Files' => 'PNG, one per screen, at the screen\'s exact pixels',
                'Place' => (string) ($poster->place ?: '—'),
                'Take down' => $poster->take_down_on?->toDateString() ?? '—',
            ];
        } else {
            $lines = [
                'Poster' => $poster->name,
                'Purpose' => $purpose['label'] ?? $poster->template_key,
                'Sizes' => implode(', ', $sizes),
                'Quantity' => self::quantities($job),
                'Material' => PosterPreflight::MATERIALS[$job['material'] ?? 'foam']['label'] ?? (string) ($job['material'] ?? 'foam'),
                'Finish' => (string) ($job['finish'] ?? 'matte'),
                'White ink' => (string) ($job['white'] ?? 'none'),
                'Gloss' => (string) ($job['gloss'] ?? 'none'),
                'Layers' => (string) ($job['layers'] ?? 'masks'),
                'Spot names' => trim((string) ($job['white_name'] ?? '') . ' ' . (string) ($job['gloss_name'] ?? '')),
                'Mirrored' => (($job['mirror'] ?? false) === true) ? 'yes, for a window read from outside' : 'no',
                'Mounting' => (string) ($job['mounting'] ?? 'none'),
                'On the sheet' => (string) ($job['imposition'] ?? 'single'),
                'Deadline' => (string) ($job['deadline'] ?? '—'),
                'Place' => (string) ($poster->place ?: '—'),
                'Take down' => $poster->take_down_on?->toDateString() ?? '—',
            ];
        }
        PosterFonts::use($pdf, 'j5', 11);
        $yy = $y + 16;
        foreach ($lines as $label => $value) {
            $pdf->SetXY($x, $yy);
            PosterFonts::use($pdf, 'j7', 11);
            $pdf->Cell(40, 6, $label, 0, 0, 'L');
            PosterFonts::use($pdf, 'j5', 11);
            $pdf->Cell($w - 40, 6, $value, 0, 0, 'L');
            $yy += 8;
        }

        $pdf->SetXY($x, $yy + 4);
        PosterFonts::use($pdf, 'j5', 9);
        $notes = [$screens !== [] && count($screens) === count($sizes)
            ? 'Put the PNG on the TV, a USB stick or the signage player; My posters → TV puts it on the shop\'s playlist.'
            : 'Files are PDF/X-4, 3 mm bleed, FOGRA39. Crop marks are off; add your own if you need them.'];
        foreach ($preflight as $sizeName => $checks) {
            foreach ($checks as $check) {
                if (($check['level'] ?? '') === 'amber') {
                    $notes[] = $sizeName . ': ' . $check['message'];
                }
            }
        }
        $pdf->MultiCell($w, 5, implode("\n", $notes), 0, 'L');

        return $pdf->bytes();
    }

    /** @param array<string, mixed> $job */
    private static function quantities(array $job): string
    {
        $qty = is_array($job['quantity'] ?? null) ? $job['quantity'] : [];
        if ($qty === []) {
            return '1 of each size';
        }
        $parts = [];
        foreach ($qty as $size => $n) {
            $parts[] = $size . ' × ' . (int) $n;
        }

        return implode(', ', $parts);
    }
}
