<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\Media;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

/**
 * Pictures for a label as PNG data URIs: dompdf never fetches over the
 * network, and a data URI prints the same in the browser. Transparent margins
 * are trimmed (the stored logo is a 1080 px square with the mark in the
 * middle) and the picture is scaled down to what the label needs.
 */
final class LabelImage
{
    public static function fromPublic(string $relative, int $maxPx = 600): ?string
    {
        return self::fromFile(public_path(ltrim($relative, '/')), $maxPx);
    }

    public static function fromMedia(?int $mediaId, int $maxPx = 900): ?string
    {
        if (!$mediaId) {
            return null;
        }
        $media = Media::query()->find($mediaId);
        if ($media === null || $media->media_type !== 'image') {
            return null;
        }
        // The library keeps a JPEG copy for the website and the original as
        // uploaded; a label wants the original, or a transparent PNG (the
        // hand lettering, a cut-out) prints in a white box.
        $original = self::fromPublicUrl($media->original_url ?? null, $maxPx);
        if ($original !== null) {
            return $original;
        }
        try {
            $path = Storage::disk($media->disk ?: 'public')->path($media->path);
        } catch (\Throwable) {
            return null;
        }

        return self::fromFile($path, $maxPx);
    }

    /** A public URL such as an item's cut-out (/storage/...), when it is a file here. */
    public static function fromPublicUrl(?string $url, int $maxPx = 900): ?string
    {
        $path = (string) (parse_url((string) $url, PHP_URL_PATH) ?: '');
        if ($path === '' || str_contains($path, '..')) {
            return null;
        }

        return self::fromFile(public_path(ltrim($path, '/')), $maxPx);
    }

    public static function fromFile(string $file, int $maxPx = 900): ?string
    {
        if (!is_file($file) || !is_readable($file) || filesize($file) > 12 * 1024 * 1024) {
            return null;
        }
        $key = 'label-image:' . md5($file . '|' . (string) @filemtime($file) . '|' . $maxPx);
        try {
            $uri = Cache::remember($key, 86400, fn () => self::render($file, $maxPx));
        } catch (\Throwable) {
            $uri = self::render($file, $maxPx);
        }

        return $uri !== '' ? $uri : null;
    }

    /** Width ÷ height of a data URI's picture, for fitting it in a box. */
    public static function ratio(?string $uri): float
    {
        if ($uri === null || !str_starts_with($uri, 'data:image/png;base64,')) {
            return 1.0;
        }
        $size = @getimagesizefromstring((string) base64_decode(substr($uri, 22), true));

        return ($size && $size[1] > 0) ? $size[0] / $size[1] : 1.0;
    }

    private static function render(string $file, int $maxPx): string
    {
        $img = @imagecreatefromstring((string) file_get_contents($file));
        if ($img === false) {
            return '';
        }
        imagepalettetotruecolor($img);
        imagealphablending($img, false);
        imagesavealpha($img, true);

        [$x0, $y0, $x1, $y1] = self::opaqueBounds($img);
        $w = $x1 - $x0 + 1;
        $h = $y1 - $y0 + 1;
        $k = min(1.0, $maxPx / max($w, $h));
        $tw = max(1, (int) round($w * $k));
        $th = max(1, (int) round($h * $k));

        $out = imagecreatetruecolor($tw, $th);
        imagealphablending($out, false);
        imagesavealpha($out, true);
        imagefill($out, 0, 0, imagecolorallocatealpha($out, 0, 0, 0, 127));
        imagecopyresampled($out, $img, 0, 0, $x0, $y0, $tw, $th, $w, $h);

        ob_start();
        imagepng($out, null, 6);
        $png = (string) ob_get_clean();
        imagedestroy($img);
        imagedestroy($out);

        return 'data:image/png;base64,' . base64_encode($png);
    }

    /** @return array{0: int, 1: int, 2: int, 3: int} */
    private static function opaqueBounds(\GdImage $img): array
    {
        $w = imagesx($img);
        $h = imagesy($img);
        $step = max(1, (int) floor(max($w, $h) / 400));
        // Transparent margins are background; so is white, when the picture
        // has no transparency at its corners (a JPEG from the media library,
        // which flattens uploads onto white).
        $corners = [imagecolorat($img, 0, 0), imagecolorat($img, $w - 1, 0), imagecolorat($img, 0, $h - 1), imagecolorat($img, $w - 1, $h - 1)];
        $opaqueCorners = count(array_filter($corners, fn (int $c) => (($c >> 24) & 0x7F) < 120)) === 4;
        $isBackground = function (int $c) use ($opaqueCorners): bool {
            if ((($c >> 24) & 0x7F) >= 120) {
                return true;
            }

            return $opaqueCorners && (($c >> 16) & 0xFF) > 245 && (($c >> 8) & 0xFF) > 245 && ($c & 0xFF) > 245;
        };
        $minX = $w;
        $minY = $h;
        $maxX = -1;
        $maxY = -1;
        for ($y = 0; $y < $h; $y += $step) {
            for ($x = 0; $x < $w; $x += $step) {
                if (!$isBackground(imagecolorat($img, $x, $y))) {
                    $minX = min($minX, $x);
                    $maxX = max($maxX, $x);
                    $minY = min($minY, $y);
                    $maxY = max($maxY, $y);
                }
            }
        }
        if ($maxX < 0) {
            return [0, 0, $w - 1, $h - 1];
        }

        return [max(0, $minX - $step), max(0, $minY - $step), min($w - 1, $maxX + $step), min($h - 1, $maxY + $step)];
    }
}
