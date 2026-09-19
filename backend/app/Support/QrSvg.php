<?php

declare(strict_types=1);

namespace App\Support;

use BaconQrCode\Common\ErrorCorrectionLevel;
use BaconQrCode\Encoder\Encoder;
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
    /**
     * @param bool $withLogoSpace Highest error correction, so a logo laid
     *                            over the middle (up to about a quarter of
     *                            the width) still leaves the code readable.
     */
    public static function svg(string $text, int $size = 160, bool $withLogoSpace = false): string
    {
        $renderer = new ImageRenderer(new RendererStyle($size, 1), new SvgImageBackEnd);

        return (new Writer($renderer))->writeString(
            $text,
            Encoder::DEFAULT_BYTE_MODE_ENCODING,
            $withLogoSpace ? ErrorCorrectionLevel::H() : null,
        );
    }

    /** `data:` URI for an <img>, which dompdf renders the same as a browser. */
    public static function dataUri(string $text, int $size = 160, bool $withLogoSpace = false): string
    {
        return 'data:image/svg+xml;base64,' . base64_encode(self::svg($text, $size, $withLogoSpace));
    }
}
