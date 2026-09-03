<?php

declare(strict_types=1);

namespace App\Support;

use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;

/**
 * A QR code as an SVG, for a receipt page, a PDF or a printed card.
 *
 * Owner, 2026-09-02: a QR on the receipt so a customer reaches the receipt,
 * its feedback and complaint form in one scan, and the till pulls the order
 * back up by scanning the paper. Pure PHP: the server has GD but no
 * Imagick, and an SVG scales to any print size without a raster step.
 */
final class QrSvg
{
    public static function svg(string $text, int $size = 160): string
    {
        $renderer = new ImageRenderer(new RendererStyle($size, 1), new SvgImageBackEnd);

        return (new Writer($renderer))->writeString($text);
    }

    /** `data:` URI for an <img>, which dompdf renders the same as a browser. */
    public static function dataUri(string $text, int $size = 160): string
    {
        return 'data:image/svg+xml;base64,' . base64_encode(self::svg($text, $size));
    }
}
