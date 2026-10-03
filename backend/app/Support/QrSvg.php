<?php

declare(strict_types=1);

namespace App\Support;

use BaconQrCode\Common\ErrorCorrectionLevel;
use BaconQrCode\Encoder\Encoder;
use BaconQrCode\Renderer\Color\Rgb;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\Fill;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;

/**
 * A QR code as an SVG, for a receipt page, a PDF or a printed card.
 *
 * Owner, 2026-09-02: a QR on the receipt so a customer reaches the receipt,
 * its feedback and complaint form in one scan, and the till pulls the order
 * back up by scanning the paper. Pure PHP: the server has GD but no
 * Imagick, and an SVG scales to any print size without a raster step.
 *
 * Owner, 2026-09-21: "Why no logo inside the qr code?" It used to be a
 * second picture laid over the middle by CSS, which only the poster and the
 * receipt page assembled — and which dompdf cannot be trusted to do at all,
 * so every PDF carried a bare code. The logo now goes *inside* the SVG, so
 * a browser, dompdf and a canvas export all draw the one picture.
 */
final class QrSvg
{
    /**
     * How wide the logo sits across the code. The highest error correction
     * recovers about 30% of the code's words, and a quarter of the width is
     * roughly a sixteenth of the area — comfortably inside that, and still
     * readable on the 26mm code on a booklet's back cover.
     */
    public const LOGO_RATIO = 0.26;

    /**
     * @param bool $withLogoSpace Highest error correction, so a logo laid
     *                            over the middle (up to about a quarter of
     *                            the width) still leaves the code readable.
     * @param ?string $logo A `data:` URI for a raster logo to draw in the
     *                      middle. Anything else is ignored — see
     *                      {@see embeddable()}.
     */
    public static function svg(
        string $text,
        int $size = 160,
        bool $withLogoSpace = false,
        ?string $logo = null,
        float $logoRatio = self::LOGO_RATIO,
        ?string $color = null,
    ): string {
        $mark = self::embeddable($logo);
        $renderer = new ImageRenderer(new RendererStyle($size, 1, null, null, self::fill($color)), new SvgImageBackEnd);

        $svg = (new Writer($renderer))->writeString(
            $text,
            Encoder::DEFAULT_BYTE_MODE_ENCODING,
            ($withLogoSpace || $mark !== null) ? ErrorCorrectionLevel::H() : null,
        );

        return $mark === null ? $svg : self::layLogoOver($svg, $size, $mark, $logoRatio);
    }

    /**
     * The code with the brand mark in the middle, ready for an <img>.
     *
     * The mark is asked for at roughly twice the size it will be drawn, so a
     * 300dpi print has pixels to spare without carrying the 1080px masthead
     * inside every code.
     */
    public static function branded(string $text, int $size = 160, float $logoRatio = self::LOGO_RATIO, ?string $color = null): string
    {
        return self::dataUri(
            $text,
            $size,
            withLogoSpace: true,
            logo: BrandMark::dataUri((int) round($size * $logoRatio * 2)),
            logoRatio: $logoRatio,
            color: $color,
        );
    }

    /**
     * Modules in a brand colour instead of black (owner, 2026-10-03: the
     * complaint poster "too much black"). Only a dark colour is accepted —
     * a scanner needs dark on light — so anything lighter than the cut-off
     * falls back to black rather than printing a code nobody can read.
     */
    private static function fill(?string $color): ?Fill
    {
        if ($color === null || !preg_match('/^#?([0-9a-f]{6})$/i', $color, $m)) {
            return null;
        }
        [$r, $g, $b] = array_map('hexdec', str_split($m[1], 2));
        $lum = fn (int $c): float => ($v = $c / 255) <= 0.03928 ? $v / 12.92 : (($v + 0.055) / 1.055) ** 2.4;
        $luminance = 0.2126 * $lum($r) + 0.7152 * $lum($g) + 0.0722 * $lum($b);
        // Contrast with white of at least 7:1.
        if ((1.05 / ($luminance + 0.05)) < 7.0) {
            return null;
        }

        return Fill::uniformColor(new Rgb(255, 255, 255), new Rgb($r, $g, $b));
    }

    /** `data:` URI for an <img>, which dompdf renders the same as a browser. */
    public static function dataUri(
        string $text,
        int $size = 160,
        bool $withLogoSpace = false,
        ?string $logo = null,
        float $logoRatio = self::LOGO_RATIO,
        ?string $color = null,
    ): string {
        return 'data:image/svg+xml;base64,' . base64_encode(self::svg($text, $size, $withLogoSpace, $logo, $logoRatio, $color));
    }

    /**
     * A logo this is willing to embed, or null.
     *
     * Only a raster `data:` URI. An SVG logo would be an SVG inside an SVG,
     * which dompdf's renderer does not handle, and a remote URL would have
     * the PDF renderer make an HTTP request to our own site — which fails
     * quietly behind a firewall and leaves a broken box in the middle of
     * the code. A bare code is the right answer in both cases.
     */
    public static function embeddable(?string $logo): ?string
    {
        $logo = trim((string) $logo);

        return preg_match('#^data:image/(png|jpeg|jpg|gif);base64,[A-Za-z0-9+/=]+$#', $logo) === 1
            ? $logo
            : null;
    }

    /**
     * The logo on a white pad in the middle of the code.
     *
     * The generated SVG's viewBox is `0 0 $size $size`, so the numbers here
     * are the same units as the requested pixel size. Both `href` and
     * `xlink:href` are written: browsers read the first, older renderers
     * the second.
     */
    private static function layLogoOver(string $svg, int $size, string $logo, float $logoRatio): string
    {
        $ratio = max(0.1, min(0.34, $logoRatio));
        $side = round($size * $ratio, 2);
        $pad = round($size * 0.022, 2);
        $offset = round(($size - $side) / 2, 2);
        $padOffset = round($offset - $pad, 2);
        $padSide = round($side + $pad * 2, 2);
        $radius = round($padSide * 0.18, 2);
        $href = htmlspecialchars($logo, ENT_QUOTES | ENT_XML1);

        $overlay = sprintf(
            '<rect x="%s" y="%s" width="%s" height="%s" rx="%s" ry="%s" fill="#ffffff"/>'
            . '<image x="%s" y="%s" width="%s" height="%s" preserveAspectRatio="xMidYMid meet" href="%s" xlink:href="%s"/>',
            $padOffset,
            $padOffset,
            $padSide,
            $padSide,
            $radius,
            $radius,
            $offset,
            $offset,
            $side,
            $side,
            $href,
            $href,
        );

        $at = strrpos($svg, '</svg>');
        if ($at === false) {
            return $svg;
        }

        // The <image> needs the xlink namespace declared for the attribute
        // to be legal; the QR writer does not declare it.
        $svg = preg_replace(
            '#<svg (?![^>]*xmlns:xlink)#',
            '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ',
            $svg,
            1,
        ) ?? $svg;
        $at = strrpos($svg, '</svg>');

        return substr($svg, 0, $at) . $overlay . substr($svg, $at);
    }
}
