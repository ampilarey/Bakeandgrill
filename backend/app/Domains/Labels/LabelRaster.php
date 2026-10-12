<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Support\ThaanaVisual;
use BaconQrCode\Common\ErrorCorrectionLevel;
use BaconQrCode\Encoder\Encoder;
use GdImage;
use InvalidArgumentException;

/**
 * A sticker drawn as a black-and-white bitmap for a label printer (round C,
 * 2026-10-12: "direct label-printer output"). The same pieces StickerDesign
 * places in millimetres are drawn with GD at the printer's dots per inch:
 * rectangles, lines, text from the PDF's font files (Thaana in visual order
 * with the composed face, as dompdf gets it), PNG pictures dithered, and the
 * SVG pictures redrawn from what they are (StickerSheet's `vector` map: a QR
 * from its text, a barcode from its digits; the allergen pictograms stay off,
 * their captions print). Everything then goes to one bit a dot: ink where the
 * page is darker than INK, a Bayer dither inside a photo.
 *
 * ZplEncoder and TsplEncoder wrap the bits for the two printer languages;
 * LabelSheetController serves both and the bitmap as a PNG to check.
 */
final class LabelRaster
{
    /** Dots per inch a label printer prints at. */
    public const DPIS = [203, 300];

    public const DEFAULT_DPI = 203;

    /** Below this share of white a dot prints black: text edges, the rust fills, the tints stay white. */
    private const INK = 0.62;

    /** A 4 × 4 Bayer matrix, so a photo prints as a dot pattern rather than a blot. */
    private const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

    /** GD sizes a TrueType font in points at 96 dots per inch. */
    private const GD_DPI = 96;

    /** Latin runs inside Dhivehi text set in Plus Jakarta Sans bold at 0.82 em, as the sheet does. */
    private const LATIN = '/[A-Za-z0-9°\-–+.\/:@&_]+(?:[ .][A-Za-z0-9°\-–+.\/:@&_]+)*/u';

    /**
     * One page of a built sheet as packed bits: each row `w` dots wide,
     * MSB first, 1 = black, padded to whole bytes.
     *
     * @param array<string, mixed> $build from StickerSheet::build()
     * @return array{w: int, h: int, bytes: int, rows: list<string>}
     */
    public static function page(array $build, int $page, int $dpi): array
    {
        [$im, $photos] = self::draw($build, $page, $dpi);
        $bits = self::bits($im, $photos);
        imagedestroy($im);

        return $bits;
    }

    /**
     * The bits as a PNG, black on white, to check what the printer will
     * put on the label.
     *
     * @param array{w: int, h: int, bytes: int, rows: list<string>} $bits
     */
    public static function png(array $bits): string
    {
        $im = imagecreate($bits['w'], $bits['h']);
        imagecolorallocate($im, 255, 255, 255);
        $black = imagecolorallocate($im, 0, 0, 0);
        foreach ($bits['rows'] as $y => $row) {
            for ($x = 0; $x < $bits['w']; $x++) {
                if (ord($row[$x >> 3]) & (0x80 >> ($x & 7))) {
                    imagesetpixel($im, $x, $y, $black);
                }
            }
        }
        ob_start();
        imagepng($im, null, 6);
        imagedestroy($im);

        return (string) ob_get_clean();
    }

    /** The dots a length in millimetres takes at $dpi. */
    public static function dots(float $mm, int $dpi): int
    {
        return max(1, (int) round($mm * $dpi / 25.4));
    }

    /**
     * The page drawn in colour at $dpi, and the boxes photos were drawn in
     * (those are dithered, the rest thresholded).
     *
     * @param array<string, mixed> $build
     * @return array{0: GdImage, 1: list<array{0: int, 1: int, 2: int, 3: int}>}
     */
    private static function draw(array $build, int $page, int $dpi): array
    {
        $sheet = $build['sheet'];
        $pages = $build['pages'];
        if (!isset($pages[$page])) {
            throw new InvalidArgumentException('That page is not on this sheet.');
        }
        $px = $dpi / 25.4;
        $w = self::dots((float) $sheet['page_w'], $dpi);
        $h = self::dots((float) $sheet['page_h'], $dpi);
        $im = imagecreatetruecolor($w, $h);
        imagealphablending($im, true);
        imagefilledrectangle($im, 0, 0, $w, $h, imagecolorallocate($im, 255, 255, 255));
        $photos = [];
        foreach ($sheet['slots'] as $si => $slot) {
            if (!isset($pages[$page][$si])) {
                continue;
            }
            $ox = $slot['x'] + $sheet['dx'];
            $oy = $slot['y'] + $sheet['dy'];
            $s = (float) $sheet['scale'];
            foreach ($pages[$page][$si] as $p) {
                $x = (float) (($ox + $p['x'] * $s) * $px);
                $y = (float) (($oy + ($p['y'] ?? $p['base'] ?? 0) * $s) * $px);
                $pw = (float) ($p['w'] * $s * $px);
                switch ($p['t']) {
                    case 'rect':
                        self::rect($im, $p, $x, $y, $pw, (float) ($p['h'] * $s * $px), $s * $px);
                        break;
                    case 'line':
                        // Ink against whatever the line crosses: a soft rule on cream prints black, one on the dark band white.
                        imagefilledrectangle($im, (int) round($x), (int) round($y), (int) round($x + $pw), (int) round($y) + max(1, (int) round(($p['sw'] ?? 0.2) * $s * $px)) - 1, self::contrast($im, (int) round($x + $pw / 2), (int) round($y) - 1));
                        break;
                    case 'img':
                        $box = [(int) round($x), (int) round($y), (int) round($pw), (int) round($p['h'] * $s * $px)];
                        if (self::image($im, (string) $p['src'], $box, $build['vectors'] ?? [])) {
                            $photos[] = $box;
                        }
                        break;
                    case 'text':
                        self::text($im, $p, $x, $y, $pw, $s, $dpi);
                        break;
                }
            }
        }

        return [$im, $photos];
    }

    /**
     * A filled or outlined box, its corners rounded by $p['r'] (the bottom
     * two square when `rb` is set, as the date boxes' colour strip is).
     *
     * @param array<string, mixed> $p
     */
    private static function rect(GdImage $im, array $p, float $x, float $y, float $w, float $h, float $k): void
    {
        $x1 = (int) round($x);
        $y1 = (int) round($y);
        $x2 = (int) round($x + $w) - 1;
        $y2 = (int) round($y + $h) - 1;
        if ($x2 < $x1 || $y2 < $y1) {
            return;
        }
        $r = min((int) round(($p['r'] ?? 0) * $k), (int) floor(min($w, $h) / 2));
        $rb = !array_key_exists('rb', $p);
        if (isset($p['fill'])) {
            $c = self::colour($im, $p['fill']);
            if ($r <= 1) {
                imagefilledrectangle($im, $x1, $y1, $x2, $y2, $c);
            } else {
                imagefilledrectangle($im, $x1 + $r, $y1, $x2 - $r, $y2, $c);
                imagefilledrectangle($im, $x1, $y1 + $r, $x2, $rb ? $y2 - $r : $y2, $c);
                $d = 2 * $r;
                imagefilledellipse($im, $x1 + $r, $y1 + $r, $d, $d, $c);
                imagefilledellipse($im, $x2 - $r, $y1 + $r, $d, $d, $c);
                if ($rb) {
                    imagefilledellipse($im, $x1 + $r, $y2 - $r, $d, $d, $c);
                    imagefilledellipse($im, $x2 - $r, $y2 - $r, $d, $d, $c);
                }
            }
        }
        if (isset($p['stroke'])) {
            // A hairline in a pale border colour would thin to nothing: an outline prints black or not at all.
            if (self::luminance($p['stroke']) > 0.8) {
                return;
            }
            $c = imagecolorallocate($im, 0, 0, 0);
            $sw = max(1, (int) round(($p['sw'] ?? 0.3) * $k));
            imagefilledrectangle($im, $x1, $y1, $x2, $y1 + $sw - 1, $c);
            imagefilledrectangle($im, $x1, $y2 - $sw + 1, $x2, $y2, $c);
            imagefilledrectangle($im, $x1, $y1, $x1 + $sw - 1, $y2, $c);
            imagefilledrectangle($im, $x2 - $sw + 1, $y1, $x2, $y2, $c);
        }
    }

    /**
     * A picture into its box: a PNG scaled in (true, so the box is dithered),
     * a QR or a barcode redrawn from what it is, anything else left out.
     *
     * @param array{0: int, 1: int, 2: int, 3: int} $box
     * @param array<string, array{0: string, 1: string}> $vectors what each SVG on the sheet is (StickerSheet::build()'s `vectors`)
     */
    private static function image(GdImage $im, string $src, array $box, array $vectors): bool
    {
        [$x, $y, $w, $h] = $box;
        if ($w < 1 || $h < 1) {
            return false;
        }
        if (str_starts_with($src, 'data:image/svg+xml;base64,')) {
            $what = $vectors[$src] ?? null;
            if ($what === null) {
                return false;
            }
            if ($what[0] === 'qr') {
                self::qr($im, (string) $what[1], $x, $y, min($w, $h));
            } elseif ($what[0] === 'ean') {
                self::ean($im, (string) $what[1], $x, $y, $w, $h);
            }

            return false;
        }
        if (!preg_match('#^data:image/(png|jpeg|jpg|gif);base64,#', $src, $m)) {
            return false;
        }
        $bytes = base64_decode(substr($src, strlen($m[0])), true);
        $pic = $bytes !== false && $bytes !== '' ? @imagecreatefromstring($bytes) : false;
        if ($pic === false) {
            return false;
        }
        imagealphablending($pic, false);
        imagesavealpha($pic, true);
        imagecopyresampled($im, $pic, $x, $y, 0, 0, $w, $h, imagesx($pic), imagesy($pic));
        imagedestroy($pic);

        return true;
    }

    /** A QR code for $text filling a square $side dots wide, one module of quiet zone inside it. */
    private static function qr(GdImage $im, string $text, int $x, int $y, int $side): void
    {
        $matrix = Encoder::encode($text, ErrorCorrectionLevel::M(), Encoder::DEFAULT_BYTE_MODE_ENCODING)->getMatrix();
        $n = $matrix->getWidth();
        $cell = $side / ($n + 2);
        $black = imagecolorallocate($im, 0, 0, 0);
        $white = imagecolorallocate($im, 255, 255, 255);
        imagefilledrectangle($im, $x, $y, $x + $side - 1, $y + $side - 1, $white);
        for ($r = 0; $r < $n; $r++) {
            for ($c = 0; $c < $n; $c++) {
                if ($matrix->get($c, $r) !== 1) {
                    continue;
                }
                $x1 = $x + (int) round(($c + 1) * $cell);
                $y1 = $y + (int) round(($r + 1) * $cell);
                $x2 = $x + (int) round(($c + 2) * $cell) - 1;
                $y2 = $y + (int) round(($r + 2) * $cell) - 1;
                imagefilledrectangle($im, $x1, $y1, max($x1, $x2), max($y1, $y2), $black);
            }
        }
    }

    /** EAN bars across $w dots, the standard's seven quiet modules either side, $h dots tall. */
    private static function ean(GdImage $im, string $code, int $x, int $y, int $w, int $h): void
    {
        $modules = Barcode::modules($code);
        $n = strlen($modules);
        $total = $n + 14;
        $mw = $w / $total;
        $black = imagecolorallocate($im, 0, 0, 0);
        $white = imagecolorallocate($im, 255, 255, 255);
        imagefilledrectangle($im, $x, $y, $x + $w - 1, $y + $h - 1, $white);
        for ($i = 0; $i < $n; $i++) {
            if ($modules[$i] !== '1') {
                continue;
            }
            $x1 = $x + (int) round((7 + $i) * $mw);
            $x2 = $x + (int) round((8 + $i) * $mw) - 1;
            imagefilledrectangle($im, $x1, $y, max($x1, $x2), $y + $h - 1, $black);
        }
    }

    /**
     * A line of text on its baseline, aligned in its box, in the PDF's font
     * file: Latin from Plus Jakarta Sans or DM Serif Display, Dhivehi in
     * visual order from the composed Noto (or the face picked in Settings),
     * allergens in the bold face, a spaced heading letter by letter, and a
     * hand-thickened Dhivehi line drawn beside itself as the sheet does.
     *
     * @param array<string, mixed> $p
     */
    private static function text(GdImage $im, array $p, float $x, float $base, float $boxW, float $s, int $dpi): void
    {
        $text = (string) $p['text'];
        if (trim($text) === '') {
            return;
        }
        $pt = (float) $p['pt'] * $s;
        $font = (string) $p['font'];
        $bold = (float) ($p['bold'] ?? 0);
        $ls = isset($p['ls']) ? (float) $p['ls'] : 0.0;
        $segments = self::segments($text, $font, $pt, $bold, $p['bold_words'] ?? []);
        $gd = fn (float $size): float => $size * $dpi / self::GD_DPI;
        $gap = fn (float $size): float => $ls * $size * $dpi / 72;

        // Measure, then place by the alignment.
        $total = 0.0;
        foreach ($segments as $i => $seg) {
            $segments[$i]['w'] = self::width($seg['file'], $gd($seg['pt']), $seg['text'], $gap($seg['pt']));
            $total += $segments[$i]['w'];
        }
        $start = match ($p['align']) {
            'c' => $x + ($boxW - $total) / 2,
            'r' => $x + $boxW - $total,
            default => $x,
        };
        // Pure ink against what the line sits on: black on paper or a tint,
        // white on the rust and the dark band. A thin line in a soft colour
        // would otherwise break up at the threshold.
        $colour = self::contrast($im, (int) round($start + $total / 2), (int) round($base - 0.35 * $pt * $dpi / 72));
        // Thickened by drawing beside itself (size × 0.035 × weight, in mm) when the face has no bold to use.
        $trueBold = $font === 'dv' && $bold >= LabelText::DV_BOLD_FROM && LabelText::dvHasBold();
        $nudge = $bold > 0 && !$trueBold ? $pt * 0.035 * $bold * LabelText::PT * $dpi / 25.4 : 0.0;
        $offsets = $nudge > 0.5 ? [-$nudge / 2, $nudge / 2, 0.0] : [0.0];

        $cx = $start;
        foreach ($segments as $seg) {
            foreach ($offsets as $dx) {
                if ($gap($seg['pt']) > 0) {
                    $at = $cx;
                    foreach (preg_split('//u', $seg['text'], -1, PREG_SPLIT_NO_EMPTY) ?: [] as $ch) {
                        imagettftext($im, $gd($seg['pt']), 0, (int) round($at + $dx), (int) round($base), $colour, $seg['file'], $ch);
                        $at += self::width($seg['file'], $gd($seg['pt']), $ch, 0.0) + $gap($seg['pt']);
                    }
                } else {
                    imagettftext($im, $gd($seg['pt']), 0, (int) round($cx + $dx), (int) round($base), $colour, $seg['file'], $seg['text']);
                }
            }
            $cx += $seg['w'];
        }
    }

    /**
     * The runs a line sets in, each with its font file and size.
     *
     * @param list<string> $boldWords
     * @return list<array{file: string, pt: float, text: string}>
     */
    private static function segments(string $text, string $font, float $pt, float $bold, array $boldWords): array
    {
        if ($font === 'dv' && ThaanaVisual::hasThaana($text)) {
            $face = LabelText::dvFace();
            $trueBold = $bold >= LabelText::DV_BOLD_FROM && $face['bold_pdf'] !== null;
            $file = $trueBold ? $face['bold_pdf'] : $face['pdf'];
            $visual = ThaanaVisual::order($text, $face['composed']);
            // Latin runs in Plus Jakarta Sans bold at 0.82 em: the Thaana faces carry no Latin.
            $out = [];
            $pos = 0;
            if (preg_match_all(self::LATIN, $visual, $m, PREG_OFFSET_CAPTURE)) {
                foreach ($m[0] as [$run, $offset]) {
                    if ($offset > $pos) {
                        $out[] = ['file' => $file, 'pt' => $pt, 'text' => substr($visual, $pos, $offset - $pos)];
                    }
                    $out[] = ['file' => LabelText::file('j7'), 'pt' => $pt * 0.82, 'text' => $run];
                    $pos = $offset + strlen($run);
                }
            }
            if ($pos < strlen($visual)) {
                $out[] = ['file' => $file, 'pt' => $pt, 'text' => substr($visual, $pos)];
            }

            return $out;
        }
        $file = LabelText::file($font === 'dv' ? 'j5' : $font);
        if ($boldWords === []) {
            return [['file' => $file, 'pt' => $pt, 'text' => $text]];
        }
        // Allergens in bold inside the ingredients: whole words, any case.
        $pattern = '/\b(' . implode('|', array_map(fn ($w) => preg_quote($w, '/'), $boldWords)) . ')\b/iu';
        $out = [];
        foreach (preg_split($pattern, $text, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) ?: [] as $part) {
            $isBold = (bool) preg_match('/^(' . implode('|', array_map(fn ($w) => preg_quote($w, '/'), $boldWords)) . ')$/iu', $part);
            $out[] = ['file' => $isBold ? LabelText::file('j7') : $file, 'pt' => $pt, 'text' => $part];
        }

        return $out;
    }

    /** How wide GD draws $text, letter-spaced by $gap dots after each letter. */
    private static function width(string $file, float $size, string $text, float $gap): float
    {
        if ($text === '') {
            return 0.0;
        }
        if ($gap > 0) {
            $w = 0.0;
            foreach (preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $ch) {
                $w += self::width($file, $size, $ch, 0.0) + $gap;
            }

            return $w;
        }
        $box = @imagettfbbox($size, 0, $file, $text);
        if ($box === false) {
            return 0.0;
        }

        return (float) max($box[2], $box[4]) - min($box[0], $box[6]);
    }

    /**
     * The drawn page to one bit a dot. A dot inside a photo's box takes the
     * Bayer threshold for its place, so a picture prints as a pattern;
     * everything else prints black below INK.
     *
     * @param list<array{0: int, 1: int, 2: int, 3: int}> $photos
     * @return array{w: int, h: int, bytes: int, rows: list<string>}
     */
    private static function bits(GdImage $im, array $photos): array
    {
        $w = imagesx($im);
        $h = imagesy($im);
        $bytes = intdiv($w + 7, 8);
        imagefilter($im, IMG_FILTER_GRAYSCALE);
        $ink = (int) round(self::INK * 255);
        $rows = [];
        for ($y = 0; $y < $h; $y++) {
            $spans = [];
            foreach ($photos as [$px, $py, $pw, $ph]) {
                if ($y >= $py && $y < $py + $ph) {
                    $spans[] = [$px, $px + $pw - 1];
                }
            }
            $row = array_fill(0, $bytes, 0);
            for ($x = 0; $x < $w; $x++) {
                $v = imagecolorat($im, $x, $y) & 0xFF;
                $limit = $ink;
                foreach ($spans as [$a, $b]) {
                    if ($x >= $a && $x <= $b) {
                        $limit = (int) ((self::BAYER[$y & 3][$x & 3] + 0.5) * 16);
                        break;
                    }
                }
                if ($v < $limit) {
                    $row[$x >> 3] |= 0x80 >> ($x & 7);
                }
            }
            $rows[] = pack('C*', ...$row);
        }

        return ['w' => $w, 'h' => $h, 'bytes' => $bytes, 'rows' => $rows];
    }

    private static function colour(GdImage $im, string $hex): int
    {
        [$r, $g, $b] = self::rgb($hex);

        return imagecolorallocate($im, $r, $g, $b);
    }

    /** Black, or white when the dot under ($x, $y) is already dark. */
    private static function contrast(GdImage $im, int $x, int $y): int
    {
        $x = max(0, min(imagesx($im) - 1, $x));
        $y = max(0, min(imagesy($im) - 1, $y));
        $c = imagecolorat($im, $x, $y);
        $lum = (0.2126 * (($c >> 16) & 0xFF) + 0.7152 * (($c >> 8) & 0xFF) + 0.0722 * ($c & 0xFF)) / 255;

        return $lum < 0.5 ? imagecolorallocate($im, 255, 255, 255) : imagecolorallocate($im, 0, 0, 0);
    }

    /** How light a colour is, 0 black to 1 white. */
    private static function luminance(string $hex): float
    {
        [$r, $g, $b] = self::rgb($hex);

        return (0.2126 * $r + 0.7152 * $g + 0.0722 * $b) / 255;
    }

    /** @return array{0: int, 1: int, 2: int} */
    private static function rgb(string $hex): array
    {
        $hex = ltrim($hex, '#');
        if (strlen($hex) === 3) {
            $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
        }
        [$r, $g, $b] = array_map('hexdec', str_split(str_pad($hex, 6, '0'), 2));

        return [(int) $r, (int) $g, (int) $b];
    }
}
