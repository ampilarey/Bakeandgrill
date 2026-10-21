<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Domains\Posters\Pdf\PdfX4Document;
use App\Domains\Posters\Pdf\PosterFonts;
use App\Support\ThaanaVisual;
use BaconQrCode\Common\ErrorCorrectionLevel;
use BaconQrCode\Encoder\Encoder;
use GdImage;
use RuntimeException;

/**
 * A template poster as a picture, for the TV, the social cards and the
 * shop's proof (docs/POSTER_THEMES_HANDOFF.md § 5.9). The host has no
 * Ghostscript or Imagick, so this draws the same piece list the PDF draws
 * with GD: the artwork's paths flattened to polygons and filled by
 * scanline (nonzero or even-odd, with alpha, a flat colour or a gradient),
 * strokes as thick lines with their dashes, each photo clipped to its slot,
 * the logo from its vector paths, the QR, and the text with the same
 * TrueType faces. The page is fitted whole into the picture and centred.
 */
final class PosterThemeRaster
{
    /** Pictures up to this many pixels (Full HD included) are drawn at twice the size and halved, for smooth edges. */
    private const SUPERSAMPLE_UNDER = 2_100_000;

    /** @var array<string, int> */
    private array $colours = [];

    private function __construct(
        private readonly GdImage $im,
        private readonly float $k,
        private readonly float $ox,
        private readonly float $oy,
        private readonly int $w,
        private readonly int $h,
    ) {}

    /**
     * @param array<string, mixed> $built from PosterThemePieces::build()
     * @param string|null $bgHex what shows around the page; the page's own colour when null
     */
    public static function draw(array $built, int $pxW, int $pxH, ?string $bgHex = null): GdImage
    {
        if (!function_exists('imagecreatetruecolor')) {
            throw new RuntimeException('The picture needs GD.');
        }
        $ss = $pxW * $pxH <= self::SUPERSAMPLE_UNDER ? 2 : 1;
        $W = $pxW * $ss;
        $H = $pxH * $ss;
        $pageW = (float) $built['w'];
        $pageH = (float) $built['h'];
        $k = min($W / $pageW, $H / $pageH);
        $im = imagecreatetruecolor($W, $H);
        if (!$im instanceof GdImage) {
            throw new RuntimeException('The picture could not be made.');
        }
        imagealphablending($im, true);
        $self = new self($im, $k, ($W - $pageW * $k) / 2, ($H - $pageH * $k) / 2, $W, $H);
        $bg = $bgHex ?? (string) ($built['hex_bg'] ?? '#1C1408');
        imagefilledrectangle($im, 0, 0, $W - 1, $H - 1, $self->colour($bg, 1.0));
        $self->page($built);
        if ($ss === 1) {
            return $im;
        }
        $out = imagecreatetruecolor($pxW, $pxH);
        if (!$out instanceof GdImage) {
            throw new RuntimeException('The picture could not be made.');
        }
        imagecopyresampled($out, $im, 0, 0, 0, 0, $pxW, $pxH, $W, $H);
        imagedestroy($im);

        return $out;
    }

    /** @param array<string, mixed> $built */
    private function page(array $built): void
    {
        $this->rect(0.0, 0.0, (float) $built['w'], (float) $built['h'], (string) ($built['hex_bg'] ?? '#FFFFFF'));
        $photos = [];
        foreach ($built['pieces'] as $piece) {
            if (($piece['type'] ?? '') === 'photo' && isset($piece['slot'])) {
                $photos[(string) $piece['slot']] = $piece;
            }
        }
        $drawn = [];
        foreach ($built['pieces'] as $piece) {
            switch ((string) ($piece['type'] ?? '')) {
                case 'backdrop':
                    foreach ($piece['items'] as $item) {
                        if (isset($item['photo_slot'])) {
                            $slot = (string) $item['photo_slot'];
                            if (isset($photos[$slot]) && !isset($drawn[$slot])) {
                                $drawn[$slot] = true;
                                $this->photo($photos[$slot]);
                            }

                            continue;
                        }
                        $this->item($item);
                    }
                    break;
                case 'photo':
                    $slot = (string) ($piece['slot'] ?? '');
                    if (!isset($drawn[$slot])) {
                        $drawn[$slot] = true;
                        $this->photo($piece);
                    }
                    break;
                case 'logo':
                    $this->logo($piece);
                    break;
                case 'qr':
                    $this->qr($piece);
                    break;
                case 'text':
                    $this->text($piece);
                    break;
            }
        }
    }

    /** @param array<string, mixed> $item a mapped backdrop item (page mm, with hex colours beside the ink) */
    private function item(array $item): void
    {
        $polys = $this->flatten($item['ops'] ?? []);
        if ($polys === []) {
            return;
        }
        $alpha = (float) ($item['opacity'] ?? 1.0);
        $rule = (string) ($item['rule'] ?? 'nonzero');
        $clip = is_array($item['clip_rect'] ?? null) ? $this->pxBox($item['clip_rect']) : null;
        if (is_array($item['gradient'] ?? null) && is_array($item['bbox'] ?? null)) {
            $this->gradient($polys, $rule, $alpha, $clip, $this->pxBox($item['bbox']), $item['gradient']);
        } elseif (is_string($item['hex'] ?? null)) {
            $this->fill($polys, $item['hex'], $alpha, $rule, $clip);
        }
        if (is_array($item['stroke'] ?? null)) {
            $this->stroke($polys, $item['stroke'], $alpha);
        }
    }

    /**
     * @param list<list<array{0: float, 1: float}>> $polys
     * @param array{0: float, 1: float, 2: float, 3: float}|null $clip px
     */
    private function fill(array $polys, string $hex, float $alpha, string $rule, ?array $clip): void
    {
        $colour = $this->colour($hex, $alpha);
        foreach ($this->spans($polys, $rule, $clip) as [$y, $xa, $xb]) {
            imageline($this->im, $xa, $y, $xb, $y, $colour);
        }
    }

    /**
     * @param list<list<array{0: float, 1: float}>> $polys
     * @param array{0: float, 1: float, 2: float, 3: float}|null $clip px
     * @param array{0: float, 1: float, 2: float, 3: float} $bbox px
     * @param array{type: string, coords: list<float>, hex_stops: list<array{0: float, 1: string}>} $gradient
     */
    private function gradient(array $polys, string $rule, float $alpha, ?array $clip, array $bbox, array $gradient): void
    {
        $stops = [];
        foreach ($gradient['hex_stops'] ?? [] as $stop) {
            $stops[] = [(float) $stop[0], PosterPhoto::rgb((string) $stop[1])];
        }
        if ($stops === []) {
            return;
        }
        [$bx, $by, $bw, $bh] = $bbox;
        $bw = max(1e-6, $bw);
        $bh = max(1e-6, $bh);
        $c = array_map('floatval', $gradient['coords']);
        $radial = ($gradient['type'] ?? 'linear') === 'radial';
        $cache = [];
        $at = function (float $t) use ($stops, &$cache, $alpha): int {
            $key = (int) round(max(0.0, min(1.0, $t)) * 255);
            if (isset($cache[$key])) {
                return $cache[$key];
            }
            $t = $key / 255;
            $rgb = $stops[0][1];
            $n = count($stops);
            for ($i = 0; $i < $n - 1; $i++) {
                if ($t >= $stops[$i][0] && $t <= $stops[$i + 1][0]) {
                    $span = max(1e-6, $stops[$i + 1][0] - $stops[$i][0]);
                    $f = ($t - $stops[$i][0]) / $span;
                    $a = $stops[$i][1];
                    $b = $stops[$i + 1][1];
                    $rgb = [(int) round($a[0] + ($b[0] - $a[0]) * $f), (int) round($a[1] + ($b[1] - $a[1]) * $f), (int) round($a[2] + ($b[2] - $a[2]) * $f)];
                    break;
                }
                if ($t > $stops[$n - 1][0]) {
                    $rgb = $stops[$n - 1][1];
                }
            }

            return $cache[$key] = (int) imagecolorallocatealpha($this->im, $rgb[0], $rgb[1], $rgb[2], (int) round((1 - $alpha) * 127));
        };
        if (!$radial && abs($c[0] - $c[2]) < 1e-9) {
            // A vertical gradient: one colour per row.
            $y0 = $by + $c[1] * $bh;
            $y1 = $by + $c[3] * $bh;
            foreach ($this->spans($polys, $rule, $clip) as [$y, $xa, $xb]) {
                $t = abs($y1 - $y0) < 1e-9 ? 0.0 : (($y + 0.5) - $y0) / ($y1 - $y0);
                imageline($this->im, $xa, $y, $xb, $y, $at($t));
            }

            return;
        }
        foreach ($this->spans($polys, $rule, $clip) as [$y, $xa, $xb]) {
            $v = ($y + 0.5 - $by) / $bh;
            for ($x = $xa; $x <= $xb; $x++) {
                $u = ($x + 0.5 - $bx) / $bw;
                if ($radial) {
                    $r = max(1e-6, $c[2]);
                    $t = hypot($u - $c[0], $v - $c[1]) / $r;
                } else {
                    $dx = $c[2] - $c[0];
                    $dy = $c[3] - $c[1];
                    $len = $dx * $dx + $dy * $dy;
                    $t = $len < 1e-12 ? 0.0 : (($u - $c[0]) * $dx + ($v - $c[1]) * $dy) / $len;
                }
                imagesetpixel($this->im, $x, $y, $at($t));
            }
        }
    }

    /**
     * @param list<list<array{0: float, 1: float}>> $polys
     * @param array{hex: string, width: float, dash?: list<float>|null, cap?: string} $stroke
     */
    private function stroke(array $polys, array $stroke, float $alpha): void
    {
        $colour = $this->colour((string) ($stroke['hex'] ?? '#000000'), $alpha);
        $width = max(1, (int) round((float) $stroke['width'] * $this->k));
        imagesetthickness($this->im, $width);
        $dash = is_array($stroke['dash'] ?? null) && $stroke['dash'] !== []
            ? array_values(array_map(fn ($d): float => max(0.5, (float) $d * $this->k), $stroke['dash']))
            : null;
        foreach ($polys as $poly) {
            $n = count($poly);
            if ($n < 2) {
                continue;
            }
            $on = true;
            $left = $dash[0] ?? 0.0;
            $di = 0;
            for ($i = 0; $i < $n; $i++) {
                [$x0, $y0] = $poly[$i];
                [$x1, $y1] = $poly[($i + 1) % $n];
                if ($dash === null) {
                    imageline($this->im, (int) round($x0), (int) round($y0), (int) round($x1), (int) round($y1), $colour);

                    continue;
                }
                $len = hypot($x1 - $x0, $y1 - $y0);
                $pos = 0.0;
                while ($pos < $len) {
                    $step = min($left, $len - $pos);
                    $ax = $x0 + ($x1 - $x0) * $pos / $len;
                    $ay = $y0 + ($y1 - $y0) * $pos / $len;
                    $bx = $x0 + ($x1 - $x0) * ($pos + $step) / $len;
                    $by = $y0 + ($y1 - $y0) * ($pos + $step) / $len;
                    if ($on) {
                        imageline($this->im, (int) round($ax), (int) round($ay), (int) round($bx), (int) round($by), $colour);
                    }
                    $pos += $step;
                    $left -= $step;
                    if ($left <= 1e-6) {
                        $on = !$on;
                        $di = ($di + 1) % count($dash);
                        $left = $dash[$di];
                    }
                }
            }
        }
        imagesetthickness($this->im, 1);
    }

    /** @param array<string, mixed> $piece */
    private function photo(array $piece): void
    {
        $clip = $this->flatten($piece['clip_ops'] ?? []);
        if ($clip === []) {
            return;
        }
        $behind = (string) ($piece['hex_behind'] ?? '#FFFFFF');
        $this->fill($clip, $behind, 1.0, 'nonzero', null);
        $path = $piece['path'] ?? null;
        if (!is_string($path) || !is_file($path)) {
            return;
        }
        $bytes = @file_get_contents($path);
        $src = $bytes === false ? false : @imagecreatefromstring($bytes);
        if (!$src instanceof GdImage) {
            return;
        }
        [$x, $y, $w, $h] = $this->pxBox([$piece['x'], $piece['y'], $piece['w'], $piece['h']]);
        $bw = max(1, (int) round($w));
        $bh = max(1, (int) round($h));
        $sw = imagesx($src);
        $sh = imagesy($src);
        $pic = imagecreatetruecolor($bw, $bh);
        if (!$pic instanceof GdImage) {
            imagedestroy($src);

            return;
        }
        [$r, $g, $b] = PosterPhoto::rgb($behind);
        imagealphablending($pic, true);
        imagefilledrectangle($pic, 0, 0, $bw - 1, $bh - 1, (int) imagecolorallocate($pic, $r, $g, $b));
        if (($piece['contain'] ?? false) === true) {
            $pad = (int) round(min($bw, $bh) * 0.04);
            $fit = min(($bw - 2 * $pad) / $sw, ($bh - 2 * $pad) / $sh);
            $dw = max(1, (int) round($sw * $fit));
            $dh = max(1, (int) round($sh * $fit));
            imagecopyresampled($pic, $src, (int) floor(($bw - $dw) / 2), (int) floor(($bh - $dh) / 2), 0, 0, $dw, $dh, $sw, $sh);
        } else {
            $scale = max($bw / $sw, $bh / $sh);
            $cw = (int) round($bw / $scale);
            $ch = (int) round($bh / $scale);
            imagecopyresampled($pic, $src, 0, 0, (int) floor(($sw - $cw) / 2), (int) floor(($sh - $ch) / 2), $bw, $bh, $cw, $ch);
        }
        imagedestroy($src);
        $picX = (int) round($x);
        $picY = (int) round($y);
        $rotation = (float) ($piece['rotation'] ?? 0.0);
        if (abs($rotation) > 1e-6 && is_array($piece['centre'] ?? null)) {
            // GD turns anticlockwise for a positive angle; the design's angle reads clockwise on a page.
            $clear = (int) imagecolorallocatealpha($pic, 0, 0, 0, 127);
            $turned = imagerotate($pic, -$rotation, $clear);
            if ($turned instanceof GdImage) {
                imagedestroy($pic);
                $pic = $turned;
                [$cx, $cy] = $this->pxPoint((float) $piece['centre'][0], (float) $piece['centre'][1]);
                $picX = (int) round($cx - imagesx($pic) / 2);
                $picY = (int) round($cy - imagesy($pic) / 2);
            }
        }
        $pw = imagesx($pic);
        $ph = imagesy($pic);
        foreach ($this->spans($clip, 'nonzero', [$picX, $picY, $pw, $ph]) as [$row, $xa, $xb]) {
            imagecopy($this->im, $pic, $xa, $row, $xa - $picX, $row - $picY, $xb - $xa + 1, 1);
        }
        imagedestroy($pic);
    }

    /** @param array<string, mixed> $piece */
    private function logo(array $piece): void
    {
        if (is_array($piece['badge'] ?? null)) {
            $b = $piece['badge'];
            $this->fill($this->flatten(PdfX4Document::circleOps((float) $b['cx'], (float) $b['cy'], (float) $b['r'])), (string) $b['hex'], 1.0, 'nonzero', null);
        }
        foreach (LogoVector::fromFile()->placed((float) $piece['x'], (float) $piece['y'], (float) $piece['w'], (string) ($piece['colourway'] ?? 'light')) as $shape) {
            $hex = BrandCmyk::HEX[$shape['role']] ?? '#1C1408';
            $this->fill($this->flatten($shape['ops']), $hex, 1.0, 'nonzero', null);
        }
    }

    /** @param array<string, mixed> $piece */
    private function qr(array $piece): void
    {
        $url = (string) ($piece['url'] ?? '');
        if ($url === '') {
            return;
        }
        $matrix = Encoder::encode($url, ErrorCorrectionLevel::M(), Encoder::DEFAULT_BYTE_MODE_ENCODING)->getMatrix();
        $n = $matrix->getWidth();
        [$x, $y, $w] = $this->pxBox([$piece['x'], $piece['y'], $piece['w'], $piece['h']]);
        $cell = $w / $n;
        $ink = $this->colour((string) ($piece['hex'] ?? '#1C1408'), 1.0);
        for ($r = 0; $r < $n; $r++) {
            for ($c = 0; $c < $n; $c++) {
                if ($matrix->get($c, $r) !== 1) {
                    continue;
                }
                imagefilledrectangle($this->im, (int) round($x + $c * $cell), (int) round($y + $r * $cell), (int) round($x + ($c + 1) * $cell) - 1, (int) round($y + ($r + 1) * $cell) - 1, $ink);
            }
        }
    }

    /** @param array<string, mixed> $piece */
    private function text(array $piece): void
    {
        $key = (string) ($piece['font'] ?? 'j5');
        $file = public_path('fonts/pdf/' . (PosterFonts::FILES[$key] ?? PosterFonts::FILES['j5']));
        if (!is_file($file) || !function_exists('imagettftext')) {
            return;
        }
        $text = (string) $piece['text'];
        if (($piece['dv'] ?? false) === true) {
            $text = ThaanaVisual::order($text, true);
        }
        // GD sizes type in points at 96 dpi: an em of E pixels is a size of 0.75 E.
        $size = (float) $piece['pt'] * 0.352778 * $this->k * 0.75;
        $tracking = (float) ($piece['tracking'] ?? 0.0) * $this->k;
        $alpha = (float) ($piece['opacity'] ?? 1.0);
        $chars = $tracking > 0.01 ? preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [] : [$text];
        $advances = [];
        $width = 0.0;
        if (count($chars) > 1) {
            $prefix = '';
            $prev = 0.0;
            foreach ($chars as $i => $ch) {
                $prefix .= $ch;
                $box = imagettfbbox($size, 0, $file, $prefix);
                $end = $box === false ? $prev : (float) $box[2];
                $advances[$i] = $end - $prev;
                $prev = $end;
            }
            $width = $prev + $tracking * (count($chars) - 1);
        } else {
            $box = imagettfbbox($size, 0, $file, $text);
            $width = $box === false ? 0.0 : (float) ($box[2] - $box[0]);
        }
        [$anchor, $baseline] = $this->pxPoint((float) ($piece['anchor'] ?? $piece['x']), (float) $piece['baseline']);
        $x = match ((string) ($piece['align'] ?? 'left')) {
            'center' => $anchor - $width / 2,
            'right' => $anchor - $width,
            default => $anchor,
        };
        $draw = function (float $dx, float $dy, string $hex) use ($chars, $advances, $tracking, $size, $file, $x, $baseline, $alpha, $text): void {
            $colour = $this->colour($hex, $alpha);
            if (count($chars) <= 1) {
                imagettftext($this->im, $size, 0, (int) round($x + $dx), (int) round($baseline + $dy), $colour, $file, $text);

                return;
            }
            $cx = $x + $dx;
            foreach ($chars as $i => $ch) {
                imagettftext($this->im, $size, 0, (int) round($cx), (int) round($baseline + $dy), $colour, $file, $ch);
                $cx += ($advances[$i] ?? 0.0) + $tracking;
            }
        };
        if (is_array($piece['shadow'] ?? null)) {
            $draw((float) $piece['shadow']['dx'] * $this->k, (float) $piece['shadow']['dy'] * $this->k, (string) $piece['shadow']['hex']);
        }
        $draw(0.0, 0.0, (string) ($piece['hex'] ?? '#1C1408'));
    }

    private function rect(float $x, float $y, float $w, float $h, string $hex): void
    {
        [$px, $py, $pw, $ph] = $this->pxBox([$x, $y, $w, $h]);
        imagefilledrectangle($this->im, (int) round($px), (int) round($py), (int) round($px + $pw) - 1, (int) round($py + $ph) - 1, $this->colour($hex, 1.0));
    }

    /**
     * The rows a set of polygons covers, as [y, x from, x to] in pixels,
     * by the nonzero or even-odd rule, cut to a clip box.
     *
     * @param list<list<array{0: float, 1: float}>> $polys
     * @param array{0: float, 1: float, 2: float, 3: float}|null $clip
     * @return iterable<array{0: int, 1: int, 2: int}>
     */
    private function spans(array $polys, string $rule, ?array $clip): iterable
    {
        $edges = [];
        $minY = INF;
        $maxY = -INF;
        foreach ($polys as $poly) {
            $n = count($poly);
            if ($n < 2) {
                continue;
            }
            for ($i = 0; $i < $n; $i++) {
                [$x0, $y0] = $poly[$i];
                [$x1, $y1] = $poly[($i + 1) % $n];
                if ($y0 === $y1) {
                    continue;
                }
                $dir = 1;
                if ($y0 > $y1) {
                    [$x0, $y0, $x1, $y1] = [$x1, $y1, $x0, $y0];
                    $dir = -1;
                }
                $edges[] = [$x0, $y0, $x1, $y1, $dir, ($x1 - $x0) / ($y1 - $y0)];
                $minY = min($minY, $y0);
                $maxY = max($maxY, $y1);
            }
        }
        if ($edges === []) {
            return;
        }
        $clipX0 = $clip !== null ? $clip[0] : 0.0;
        $clipX1 = $clip !== null ? $clip[0] + $clip[2] : (float) $this->w;
        $yStart = max((int) floor($minY), $clip !== null ? (int) floor($clip[1]) : 0, 0);
        $yEnd = min((int) ceil($maxY), $clip !== null ? (int) ceil($clip[1] + $clip[3]) : $this->h, $this->h) - 1;
        $evenOdd = $rule === 'evenodd';
        for ($y = $yStart; $y <= $yEnd; $y++) {
            $sy = $y + 0.5;
            $xs = [];
            foreach ($edges as [$x0, $y0, , $y1, $dir, $slope]) {
                if ($sy < $y0 || $sy >= $y1) {
                    continue;
                }
                $xs[] = [$x0 + ($sy - $y0) * $slope, $dir];
            }
            $count = count($xs);
            if ($count < 2) {
                continue;
            }
            usort($xs, static fn (array $a, array $b): int => $a[0] <=> $b[0]);
            $wind = 0;
            for ($i = 0; $i < $count - 1; $i++) {
                $wind += $evenOdd ? 1 : $xs[$i][1];
                if ($evenOdd ? ($wind % 2 === 0) : ($wind === 0)) {
                    continue;
                }
                $xa = max($xs[$i][0], $clipX0, 0.0);
                $xb = min($xs[$i + 1][0], $clipX1, (float) $this->w);
                $ia = (int) round($xa);
                $ib = (int) round($xb) - 1;
                if ($ib >= $ia) {
                    yield [$y, $ia, $ib];
                }
            }
        }
    }

    /**
     * Ops in page millimetres → polygons in pixels, curves flattened.
     *
     * @param list<array{0: string, 1: list<float>}> $ops
     * @return list<list<array{0: float, 1: float}>>
     */
    private function flatten(array $ops): array
    {
        $polys = [];
        $poly = [];
        $cx = $cy = 0.0;
        foreach ($ops as [$op, $p]) {
            switch ($op) {
                case 'M':
                    if (count($poly) > 1) {
                        $polys[] = $poly;
                    }
                    [$cx, $cy] = $this->pxPoint((float) $p[0], (float) $p[1]);
                    $poly = [[$cx, $cy]];
                    break;
                case 'L':
                    [$cx, $cy] = $this->pxPoint((float) $p[0], (float) $p[1]);
                    $poly[] = [$cx, $cy];
                    break;
                case 'C':
                    [$x1, $y1] = $this->pxPoint((float) $p[0], (float) $p[1]);
                    [$x2, $y2] = $this->pxPoint((float) $p[2], (float) $p[3]);
                    [$x3, $y3] = $this->pxPoint((float) $p[4], (float) $p[5]);
                    $len = hypot($x1 - $cx, $y1 - $cy) + hypot($x2 - $x1, $y2 - $y1) + hypot($x3 - $x2, $y3 - $y2);
                    $steps = max(3, min(64, (int) ceil($len / 2)));
                    for ($i = 1; $i <= $steps; $i++) {
                        $t = $i / $steps;
                        $u = 1 - $t;
                        $poly[] = [
                            $u * $u * $u * $cx + 3 * $u * $u * $t * $x1 + 3 * $u * $t * $t * $x2 + $t * $t * $t * $x3,
                            $u * $u * $u * $cy + 3 * $u * $u * $t * $y1 + 3 * $u * $t * $t * $y2 + $t * $t * $t * $y3,
                        ];
                    }
                    $cx = $x3;
                    $cy = $y3;
                    break;
                case 'Z':
                    if (count($poly) > 1) {
                        $polys[] = $poly;
                        [$cx, $cy] = $poly[0];
                    }
                    $poly = [[$cx, $cy]];
                    break;
            }
        }
        if (count($poly) > 1) {
            $polys[] = $poly;
        }

        return $polys;
    }

    /** @return array{0: float, 1: float} */
    private function pxPoint(float $x, float $y): array
    {
        return [$this->ox + $x * $this->k, $this->oy + $y * $this->k];
    }

    /**
     * @param array{0: float|int, 1: float|int, 2: float|int, 3: float|int} $box page mm
     * @return array{0: float, 1: float, 2: float, 3: float} px
     */
    private function pxBox(array $box): array
    {
        [$x, $y] = $this->pxPoint((float) $box[0], (float) $box[1]);

        return [$x, $y, (float) $box[2] * $this->k, (float) $box[3] * $this->k];
    }

    private function colour(string $hex, float $alpha): int
    {
        $key = $hex . '|' . round($alpha, 3);
        if (!isset($this->colours[$key])) {
            [$r, $g, $b] = PosterPhoto::rgb($hex);
            $this->colours[$key] = (int) imagecolorallocatealpha($this->im, $r, $g, $b, (int) round((1 - max(0.0, min(1.0, $alpha))) * 127));
        }

        return $this->colours[$key];
    }
}
