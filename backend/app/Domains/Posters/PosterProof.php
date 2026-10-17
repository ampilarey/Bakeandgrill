<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Models\Poster;

/**
 * A proof the shop can look at, never a print file: 1200 px on the long
 * edge (docs/POSTER_PLAN.md § 9). The print PDF stays the artwork.
 */
final class PosterProof
{
    public static function jpeg(Poster $poster): string
    {
        $content = PosterContent::resolve($poster->toArray());
        $mood = PosterMoods::get((string) $poster->mood);
        $landscape = (bool) $poster->landscape;
        $long = 1200;
        $short = (int) round($long * ($landscape ? 210 / 297 : 148 / 210));
        $w = $landscape ? $long : $short;
        $h = $landscape ? $short : $long;
        $image = imagecreatetruecolor($w, $h);
        if ($image === false) {
            return '';
        }
        [$r, $g, $b] = self::hex((string) $mood['hex_bg']);
        imagefilledrectangle($image, 0, 0, $w, $h, imagecolorallocate($image, $r, $g, $b));
        [$tr, $tg, $tb] = self::hex((string) $mood['hex_text']);
        $ink = imagecolorallocate($image, $tr, $tg, $tb);
        $lines = array_values(array_filter([
            (string) ($content['headline'] ?? $poster->name),
            (string) ($content['price'] ?? ''),
            (string) ($content['gst'] ?? ''),
            $poster->code(),
        ], static fn (string $line): bool => $line !== ''));
        $y = 40;
        foreach ($lines as $line) {
            imagestring($image, 5, 24, $y, self::ascii($line), $ink);
            $y += 28;
        }
        ob_start();
        imagejpeg($image, null, 80);
        $bytes = (string) ob_get_clean();
        imagedestroy($image);

        return $bytes;
    }

    /** @return array{0: int, 1: int, 2: int} */
    private static function hex(string $hex): array
    {
        $hex = ltrim($hex, '#');
        if (strlen($hex) !== 6) {
            return [28, 20, 8];
        }

        return [hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2))];
    }

    private static function ascii(string $text): string
    {
        $clean = preg_replace('/[^\x20-\x7E]/', '', $text) ?: '';

        return $clean !== '' ? substr($clean, 0, 70) : 'Poster';
    }
}
