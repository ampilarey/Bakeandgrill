<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Models\Poster;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * The same design as a screen picture: 1920×1080 for the TV, and the social
 * sizes (1200×630, 1080 square, 1080×1350, 1080×1920). GD, like WeeklyMenuCard.
 * A missing font falls back to the built-in face so a file still exists.
 */
final class PosterScreen
{
    public const TV = [1920, 1080];

    /** @var array<string, array{0: int, 1: int}> */
    public const SOCIAL = [
        '1200x630' => [1200, 630],
        '1080' => [1080, 1080],
        '1080x1350' => [1080, 1350],
        '1080x1920' => [1080, 1920],
    ];

    /** @return array<string, string> size key → public URL */
    public static function social(Poster $poster): array
    {
        $urls = [];
        foreach (self::SOCIAL as $key => [$w, $h]) {
            $urls[(string) $key] = self::store($poster, $w, $h, (string) $key, 'posters/cards', 'jpg');
        }

        return $urls;
    }

    public static function tv(Poster $poster): string
    {
        return self::store($poster, self::TV[0], self::TV[1], 'tv', 'posters/screens', 'png');
    }

    private static function store(Poster $poster, int $w, int $h, string $name, string $dir, string $ext): string
    {
        $bytes = self::draw($poster, $w, $h, $ext === 'png');
        $relative = $dir . '/' . $poster->code() . '-' . $name . '.' . $ext;
        Storage::disk('public')->put($relative, $bytes);

        return url('storage/' . $relative);
    }

    private static function draw(Poster $poster, int $w, int $h, bool $png): string
    {
        if (!function_exists('imagecreatetruecolor')) {
            throw new RuntimeException('The screen picture needs GD.');
        }
        $content = PosterContent::resolve($poster->toArray());
        $mood = PosterMoods::get((string) $poster->mood);
        $image = imagecreatetruecolor($w, $h);
        if ($image === false) {
            throw new RuntimeException('The screen picture could not be drawn.');
        }
        [$r, $g, $b] = self::hex((string) ($mood['hex_bg'] ?? '#1c1408'));
        [$tr, $tg, $tb] = self::hex((string) ($mood['hex_text'] ?? '#fff8f0'));
        imagefilledrectangle($image, 0, 0, $w, $h, imagecolorallocate($image, $r, $g, $b));
        $accent = imagecolorallocate($image, 183, 75, 12);
        imagefilledrectangle($image, 0, 0, (int) max(8, $w * 0.012), $h, $accent);
        $ink = imagecolorallocate($image, $tr, $tg, $tb);
        $muted = imagecolorallocate($image, 201, 184, 166);
        $font = self::font(true);
        $body = self::font(false) ?? $font;

        $headline = (string) ($content['headline'] ?? $poster->name);
        $price = (string) ($content['price'] ?? '');
        $sub = (string) ($content['subhead'] ?? '');
        $pad = (int) round($w * 0.06);
        $y = (int) round($h * 0.22);
        self::line($image, $headline, (int) round($h * 0.07), $pad, $y, $ink, $font);
        $y += (int) round($h * 0.1);
        if ($price !== '') {
            self::line($image, $price, (int) round($h * 0.045), $pad, $y, $accent, $font);
            $y += (int) round($h * 0.07);
        }
        if ($sub !== '') {
            self::line($image, $sub, (int) round($h * 0.03), $pad, $y, $muted, $body);
            $y += (int) round($h * 0.06);
        }
        $rows = is_array($content['rows'] ?? null) ? array_slice($content['rows'], 0, 10) : [];
        $rowSize = (int) max(14, round($h * 0.028));
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $label = trim((string) ($row['name'] ?? ''));
            $rowPrice = trim((string) ($row['price'] ?? ''));
            if ($label === '' && $rowPrice === '') {
                continue;
            }
            self::line($image, trim($label . '   ' . $rowPrice), $rowSize, $pad, $y, $ink, $body);
            $y += (int) round($rowSize * 1.8);
            if ($y > $h * 0.88) {
                break;
            }
        }
        self::line($image, $poster->code(), (int) max(12, round($h * 0.025)), $pad, $h - (int) round($h * 0.06), $muted, $body);

        ob_start();
        if ($png) {
            imagepng($image);
        } else {
            imagejpeg($image, null, 86);
        }
        $bytes = (string) ob_get_clean();
        imagedestroy($image);
        if ($bytes === '') {
            throw new RuntimeException('The screen picture came out empty.');
        }

        return $bytes;
    }

    /** @param \GdImage|resource $image */
    private static function line($image, string $text, int $size, int $x, int $y, int $color, ?string $font): void
    {
        $text = trim($text);
        if ($text === '') {
            return;
        }
        if ($font !== null && function_exists('imagettftext')) {
            imagettftext($image, max(10, $size), 0, $x, $y, $color, $font, $text);

            return;
        }
        imagestring($image, 5, $x, max(0, $y - 16), self::ascii($text), $color);
    }

    private static function font(bool $bold): ?string
    {
        $candidates = $bold
            ? [
                base_path('vendor/dompdf/dompdf/lib/fonts/DejaVuSans-Bold.ttf'),
                '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                public_path('fonts/a_faruma.ttf'),
            ]
            : [
                public_path('fonts/a_faruma.ttf'),
                base_path('vendor/dompdf/dompdf/lib/fonts/DejaVuSans.ttf'),
                '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            ];
        foreach ($candidates as $path) {
            if (is_file($path)) {
                return $path;
            }
        }

        return null;
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

        return $clean !== '' ? substr($clean, 0, 80) : 'Poster';
    }
}
