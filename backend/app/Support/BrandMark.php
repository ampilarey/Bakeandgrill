<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * The brand logo, small, as a PNG `data:` URI — for the middle of a QR code.
 *
 * The logo on disk is 1080px square and about 94KB, which is 128KB of
 * base64 inside every code that embeds it. Drawn at 36px on an A4 sheet,
 * that is a hundred times more picture than the paper can show, and it
 * would be carried twice over in a menu PDF that has two codes on it. This
 * hands back a copy scaled to what the code actually draws.
 *
 * Read off disk and scaled with GD (the server has GD, not Imagick). A
 * logo that is not a local raster file gets a null, and the code is drawn
 * without a mark rather than with a broken box in the middle of it.
 */
final class BrandMark
{
    /** @var array<string, ?string> */
    private static array $memo = [];

    public static function dataUri(int $px = 128): ?string
    {
        $px = max(24, min(512, $px));
        $file = self::file();
        if ($file === null) {
            return null;
        }

        $key = $file . '|' . (string) @filemtime($file) . '|' . $px;
        if (array_key_exists($key, self::$memo)) {
            return self::$memo[$key];
        }

        try {
            $uri = Cache::remember('brand-mark:' . md5($key), 86400, fn () => self::render($file, $px));
        } catch (\Throwable) {
            $uri = self::render($file, $px);
        }

        return self::$memo[$key] = ($uri !== '' ? $uri : null);
    }

    /** The brand logo on this server, when it is a raster file we can read. */
    public static function file(): ?string
    {
        $configured = trim((string) content('logo', ''));
        $path = (string) (parse_url($configured !== '' ? $configured : '/logo.png', PHP_URL_PATH) ?: '');
        if ($path === '' || !preg_match('/\.(png|jpe?g|webp|gif)$/i', $path)) {
            return null;
        }

        $file = public_path(ltrim($path, '/'));

        // A masthead logo is small; anything this large is a mistake upstream.
        return (is_file($file) && is_readable($file) && filesize($file) <= 4 * 1024 * 1024) ? $file : null;
    }

    private static function render(string $file, int $px): string
    {
        $bytes = @file_get_contents($file);
        if ($bytes === false || $bytes === '') {
            return '';
        }

        $source = @imagecreatefromstring($bytes);
        if ($source === false) {
            return '';
        }

        try {
            $w = imagesx($source);
            $h = imagesy($source);
            if ($w < 1 || $h < 1) {
                return '';
            }

            // Fit inside the box; never enlarge a logo that is already small.
            $scale = min(1.0, $px / max($w, $h));
            $tw = max(1, (int) round($w * $scale));
            $th = max(1, (int) round($h * $scale));

            $small = imagecreatetruecolor($tw, $th);
            imagealphablending($small, false);
            imagesavealpha($small, true);
            imagefill($small, 0, 0, imagecolorallocatealpha($small, 0, 0, 0, 127));
            imagecopyresampled($small, $source, 0, 0, 0, 0, $tw, $th, $w, $h);

            ob_start();
            imagepng($small, null, 9);
            $png = (string) ob_get_clean();
            imagedestroy($small);

            return $png !== '' ? 'data:image/png;base64,' . base64_encode($png) : '';
        } finally {
            imagedestroy($source);
        }
    }
}
