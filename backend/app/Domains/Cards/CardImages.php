<?php

declare(strict_types=1);

namespace App\Domains\Cards;

/**
 * Pictures on a printed card, as data URIs both renderers read. dompdf has no
 * object-fit, so a background photo is cropped to the card's shape here (GD, 300 dpi)
 * and drawn at the card's size.
 */
final class CardImages
{
    private const DPI = 300;

    /** @var array<string, string> */
    private static array $memo = [];

    public static function cover(string $path, float $wMm, float $hMm): string
    {
        $key = $path . '|' . $wMm . '|' . $hMm . '|' . (string) @filemtime($path);
        if (isset(self::$memo[$key])) {
            return self::$memo[$key];
        }
        $raw = @file_get_contents($path);
        $img = $raw !== false ? @imagecreatefromstring($raw) : false;
        if ($img === false) {
            return self::$memo[$key] = '';
        }
        $sw = imagesx($img);
        $sh = imagesy($img);
        $tw = (int) round($wMm / 25.4 * self::DPI);
        $th = (int) round($hMm / 25.4 * self::DPI);
        $scale = max($tw / $sw, $th / $sh);
        $cw = (int) round($tw / $scale);
        $ch = (int) round($th / $scale);
        $out = imagecreatetruecolor($tw, $th);
        imagecopyresampled($out, $img, 0, 0, (int) (($sw - $cw) / 2), (int) (($sh - $ch) / 2), $tw, $th, $cw, $ch);
        ob_start();
        imagejpeg($out, null, 86);
        $jpeg = (string) ob_get_clean();
        imagedestroy($img);
        imagedestroy($out);

        return self::$memo[$key] = 'data:image/jpeg;base64,' . base64_encode($jpeg);
    }

    /** The business logo: the dark-surface one for a dark card, else the standard one. */
    public static function logo(bool $dark): ?string
    {
        $key = 'logo|' . ($dark ? 'd' : 'l');
        if (array_key_exists($key, self::$memo)) {
            return self::$memo[$key] ?: null;
        }
        $set = trim((string) content($dark ? 'logo_dark' : 'logo', ''));
        $path = CardSpec::localImage($set) ?? public_path($dark ? 'brand/logo-dark.png' : 'brand/logo-light.png');
        $raw = is_file($path) ? @file_get_contents($path) : false;
        $mime = str_ends_with(strtolower($path), '.png') ? 'image/png' : (str_ends_with(strtolower($path), '.webp') ? 'image/webp' : 'image/jpeg');

        return (self::$memo[$key] = $raw !== false ? 'data:' . $mime . ';base64,' . base64_encode($raw) : '') ?: null;
    }
}
