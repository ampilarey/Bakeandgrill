<?php

declare(strict_types=1);

namespace App\Domains\Posters;

/**
 * The five moods (docs/POSTER_PLAN.md § 4.2). Screen hex is for the admin
 * preview; the file is filled with the press mixes from BrandCmyk.
 */
final class PosterMoods
{
    /**
     * @return array<string, array{bg: array{0: float, 1: float, 2: float, 3: float}, text: array{0: float, 1: float, 2: float, 3: float}, accent: array{0: float, 1: float, 2: float, 3: float}, hex_bg: string, hex_text: string, hex_accent: string, colourway: string, photo: bool}>
     */
    public static function all(): array
    {
        $ink = BrandCmyk::chosen('brown');
        $paper = BrandCmyk::chosen('cream');
        $rust = BrandCmyk::chosen('rust');
        $amber = BrandCmyk::chosen('amber');

        return [
            'dark' => self::mood($ink, $paper, $rust, BrandCmyk::HEX['brown'], BrandCmyk::HEX['cream'], BrandCmyk::HEX['rust'], 'dark', false),
            'cream' => self::mood($paper, $ink, $rust, BrandCmyk::HEX['cream'], BrandCmyk::HEX['brown'], BrandCmyk::HEX['rust'], 'light', false),
            'rust' => self::mood($rust, $paper, $amber, BrandCmyk::HEX['rust'], BrandCmyk::HEX['cream'], BrandCmyk::HEX['amber'], 'dark', false),
            'gold' => self::mood($ink, $paper, $amber, BrandCmyk::HEX['brown'], BrandCmyk::HEX['cream'], BrandCmyk::HEX['amber'], 'dark', false),
            'photo' => self::mood($ink, $paper, $amber, BrandCmyk::HEX['brown'], BrandCmyk::HEX['cream'], BrandCmyk::HEX['amber'], 'dark', true),
        ];
    }

    public static function get(string $name): array
    {
        return self::all()[$name] ?? self::all()['dark'];
    }

    /**
     * @param array{0: float, 1: float, 2: float, 3: float} $bg
     * @param array{0: float, 1: float, 2: float, 3: float} $text
     * @param array{0: float, 1: float, 2: float, 3: float} $accent
     * @return array{bg: array{0: float, 1: float, 2: float, 3: float}, text: array{0: float, 1: float, 2: float, 3: float}, accent: array{0: float, 1: float, 2: float, 3: float}, hex_bg: string, hex_text: string, hex_accent: string, colourway: string, photo: bool}
     */
    private static function mood(array $bg, array $text, array $accent, string $hexBg, string $hexText, string $hexAccent, string $colourway, bool $photo): array
    {
        return [
            'bg' => $bg, 'text' => $text, 'accent' => $accent,
            'hex_bg' => $hexBg, 'hex_text' => $hexText, 'hex_accent' => $hexAccent,
            'colourway' => $colourway, 'photo' => $photo,
        ];
    }
}
