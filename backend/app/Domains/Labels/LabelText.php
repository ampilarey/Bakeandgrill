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
        // The Dhivehi face is whichever DV_FACES entry Labels → Settings picks;
        // this row is the shape the fonts partial loops over.
        'dv' => ['LabelDV', 'fonts/pdf/NotoSansThaana-Regular.ttf', 'fonts/noto-sans-thaana-400.woff2', 1.069, 0.424],
        // The recycling marks on a wrap-around label (LabelMarks): a subset of
        // DejaVu Sans with the Unicode recycling symbols (scripts/label-symbol-font.py).
        'sym' => ['LabelSym', 'fonts/pdf/LabelSymbols.ttf', 'fonts/label-symbols.woff2', 0.928, 0.236],
    ];

    /**
     * The Thaana faces a label can print in (owner, 2026-10-12: "dhivehi font
     * is not nice"). Noto Sans Thaana (OFL, public/fonts/NOTO-SANS-THAANA-LICENSE.txt)
     * is the clean default and has a true bold; Faruma is the classic face the
     * first stickers used, thickened by hand for its headings; "site" is the
     * font uploaded in Content Hub (TTF or OTF on disk for the PDF; a WOFF2
     * upload prints the web sheet in it and the PDF in Faruma).
     *
     * key => [pdf file, web file, ascent, descent, bold pdf file, bold web file]
     *
     * @var array<string, array{0: string, 1: string, 2: float, 3: float, 4: ?string, 5: ?string}>
     */
    public const DV_FACES = [
        'noto' => ['fonts/pdf/NotoSansThaana-Regular.ttf', 'fonts/noto-sans-thaana-400.woff2', 1.069, 0.424, 'fonts/pdf/NotoSansThaana-Bold.ttf', 'fonts/noto-sans-thaana-700.woff2'],
        'faruma' => ['fonts/a_faruma.ttf', 'fonts/a_faruma.woff2', 1.139, 0.472, null, null],
        // GNU FreeSerif's Thaana (GPL with the font exception, public/fonts/FREEFONT-LICENSE.txt),
        // subset by pyftsubset; picked for the website in Content Hub and followed here by "site".
        'freeserif' => ['fonts/pdf/FreeSerifThaana-400.ttf', 'fonts/freeserif-thaana-400.woff2', 0.9, 0.302, 'fonts/pdf/FreeSerifThaana-700.ttf', 'fonts/freeserif-thaana-700.woff2'],
    ];

    /**
     * The PDF prints a face through its composed copy when one is shipped
     * (scripts/thaana-composed-font.py): every letter-plus-fili pair as one
     * glyph, so dompdf, which never reads a font's anchors, sets each fili
     * where the browser does (2026-10-12: Noto's marks drifted off wide
     * letters on the printed stickers). Faruma's marks were drawn for such
     * renderers and need no copy.
     *
     * @var array<string, array{0: string, 1: string}> key => [regular, bold]
     */
    public const COMPOSED = [
        'noto' => ['fonts/pdf/NotoSansThaana-Regular-composed.ttf', 'fonts/pdf/NotoSansThaana-Bold-composed.ttf'],
    ];

    /** @var array<string, array<string, mixed>> */
    private static array $faces = [];

    /**
     * Text at this hand-thickening or more sets in the true bold when the
     * face has one: headings, names, date labels and ingredients (0.5 and
     * up); the how-to-use lines (0.4) stay regular. Owner, 2026-10-12: "use
     * a much readable font" — on a 40 × 60 mm sticker the regular weight
     * printed faint.
     */
    public const DV_BOLD_FROM = 0.5;

    public const PT = 0.3528;

    /**
     * The Dhivehi face in use: absolute files for the PDF, URLs for the web
     * sheet, and the bold pair when there is one.
     *
     * `composed` says the PDF files carry the letter-plus-fili pair glyphs
     * (ThaanaVisual::order then hands dompdf those).
     *
     * @return array{key: string, pdf: string, web: string, ascent: float, descent: float, bold_pdf: ?string, bold_web: ?string, composed: bool}
     */
    public static function dvFace(): array
    {
        $key = LabelSettings::dhivehiFont();
        if ($key === 'site') {
            // The website's pick of a shipped face prints in that face.
            $preset = \App\Domains\Content\DhivehiFont::presetOf(trim((string) content(\App\Domains\Content\DhivehiFont::CONTENT_KEY, '')));
            if ($preset !== null && isset(self::DV_FACES[$preset])) {
                $key = $preset;
            }
        }
        if ($key === 'site') {
            $faruma = self::DV_FACES['faruma'];
            $url = trim((string) content(\App\Domains\Content\DhivehiFont::CONTENT_KEY, ''));

            return [
                'key' => 'site',
                'pdf' => \App\Domains\Content\DhivehiFont::pdfFile() ?? public_path($faruma[0]),
                'web' => \App\Domains\Content\DhivehiFont::isSafePublicUrl($url) ? $url : '/' . $faruma[1],
                'ascent' => $faruma[2],
                'descent' => $faruma[3],
                'bold_pdf' => null,
                'bold_web' => null,
                'composed' => false,
            ];
        }
        $key = isset(self::DV_FACES[$key]) ? $key : 'noto';
        if (isset(self::$faces[$key])) {
            return self::$faces[$key];
        }
        $face = self::DV_FACES[$key];
        $composed = isset(self::COMPOSED[$key]) && is_file(public_path(self::COMPOSED[$key][0])) && is_file(public_path(self::COMPOSED[$key][1]));

        return self::$faces[$key] = [
            'key' => $key,
            'pdf' => public_path($composed ? self::COMPOSED[$key][0] : $face[0]),
            'web' => '/' . $face[1],
            'ascent' => $face[2],
            'descent' => $face[3],
            'bold_pdf' => $composed ? public_path(self::COMPOSED[$key][1]) : ($face[4] !== null ? public_path($face[4]) : null),
            'bold_web' => $face[5] !== null ? '/' . $face[5] : null,
            'composed' => $composed,
        ];
    }

    public static function dvHasBold(): bool
    {
        return self::dvFace()['bold_pdf'] !== null;
    }

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
        return $font === 'dv' ? self::dvFace()['ascent'] : (self::FONTS[$font][3] ?? 1.0);
    }

    public static function descent(string $font): float
    {
        return $font === 'dv' ? self::dvFace()['descent'] : (self::FONTS[$font][4] ?? 0.25);
    }

    /**
     * The file text is measured in. Dhivehi measures in the bold when the
     * face has one: the designs size and wrap a line before they know its
     * weight, and the bold is the wider, so a heading never runs past its
     * box and a plain line wraps a touch early at worst.
     */
    public static function file(string $font): string
    {
        if ($font === 'dv') {
            $face = self::dvFace();

            return $face['bold_pdf'] ?? $face['pdf'];
        }

        return public_path(self::FONTS[$font][1] ?? self::FONTS['j4'][1]);
    }
}
