<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Domains\Content\BrandPalette;
use App\Models\SiteSetting;
use Throwable;

/**
 * The brand colours as press ink (docs/POSTER_PLAN.md § 6.6).
 *
 * docs/brand/PALETTE.md fixes the five colours of the mark in RGB. A UV
 * press mixes them from cyan, magenta, yellow and black, and the same hex
 * can be built several ways that look different under shop lights. So each
 * colour has five candidates here; the swatch card (SwatchCard) prints them
 * all with the hex beside them, the owner picks one per colour, and the
 * picks are kept in the `poster_brand_cmyk` setting. Until a pick is made
 * the first candidate (the plain conversion) is used.
 *
 * Values are percentages: [C, M, Y, K].
 */
final class BrandCmyk
{
    public const SETTING = 'poster_brand_cmyk';

    /** role → hex, from docs/brand/PALETTE.md "The five colours in the mark". */
    public const HEX = [
        'rust' => '#B74B0C',
        'brown' => BrandPalette::DARK_TEXT,
        'amber' => '#CA7D1C',
        'flame' => '#F7670B',
        'cream' => '#F7F5F2',
    ];

    public const LABELS = [
        'rust' => 'Rust',
        'brown' => 'Dark brown',
        'amber' => 'Golden amber',
        'flame' => 'Flame',
        'cream' => 'Cream',
    ];

    /** Letters the swatch card prints beside each candidate. */
    public const CANDIDATE_KEYS = ['A', 'B', 'C', 'D', 'E'];

    /** Small text: 100 % K. Large black areas: rich black (§ 6.1). */
    public const TEXT_BLACK = [0.0, 0.0, 0.0, 100.0];

    public const RICH_BLACK = [60.0, 40.0, 40.0, 100.0];

    public const PAPER_WHITE = [0.0, 0.0, 0.0, 0.0];

    /**
     * Five ways to mix one colour, in print order on the card.
     *
     * A: the plain conversion. B: less black, more colour (lighter, more
     * saturated on a glossy board). C: warmer (more yellow, less magenta).
     * D: deeper (more black). E: the nearest round press mix, the kind a
     * designer would type by hand.
     *
     * @return array<string, array{0: float, 1: float, 2: float, 3: float}>
     */
    public static function candidates(string $role): array
    {
        $base = self::fromHex(self::HEX[$role]);
        [$c, $m, $y, $k] = $base;

        $lessBlack = max(0.0, $k - 12.0);
        $lift = ($k - $lessBlack) * 0.6;

        $out = [
            'A' => $base,
            'B' => self::clamp([$c + $lift * ($c > 0 ? 1 : 0), $m + $lift, $y + $lift, $lessBlack]),
            'C' => self::clamp([$c, $m - 4.0, $y + 6.0, $k]),
            'D' => self::clamp([$c, $m, $y, $k + 8.0]),
            'E' => self::clamp(array_map(static fn (float $v): float => round($v / 5) * 5, $base)),
        ];

        if ($role === 'cream') {
            // Paper-white stock gets cream from a hint of yellow, nothing darker.
            $out['B'] = [0.0, 1.0, 3.0, 0.0];
            $out['C'] = [0.0, 2.0, 5.0, 0.0];
            $out['D'] = [1.0, 1.0, 4.0, 1.0];
            $out['E'] = self::PAPER_WHITE;
        }

        return $out;
    }

    /** The CMYK the posters use for a role: the owner's pick, else candidate A. */
    public static function chosen(string $role): array
    {
        $picks = self::picks();
        $key = $picks[$role] ?? 'A';
        $all = self::candidates($role);

        return $all[$key] ?? $all['A'];
    }

    /** @return array<string, string> role → candidate letter */
    public static function picks(): array
    {
        try {
            $raw = SiteSetting::get(self::SETTING, '');
        } catch (Throwable) {
            // No database (a CLI spike on a laptop): the plain conversion stands.
            return [];
        }
        $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
        if (!is_array($decoded)) {
            return [];
        }
        $out = [];
        foreach ($decoded as $role => $letter) {
            if (isset(self::HEX[$role]) && is_string($letter) && in_array($letter, self::CANDIDATE_KEYS, true)) {
                $out[$role] = $letter;
            }
        }

        return $out;
    }

    /**
     * Plain RGB → CMYK: black is what every channel shares, the rest is
     * the colour. Percentages, one decimal.
     *
     * @return array{0: float, 1: float, 2: float, 3: float}
     */
    public static function fromHex(string $hex): array
    {
        $hex = ltrim($hex, '#');
        $r = hexdec(substr($hex, 0, 2)) / 255;
        $g = hexdec(substr($hex, 2, 2)) / 255;
        $b = hexdec(substr($hex, 4, 2)) / 255;
        $k = 1 - max($r, $g, $b);
        if ($k >= 0.999) {
            return [0.0, 0.0, 0.0, 100.0];
        }
        $c = (1 - $r - $k) / (1 - $k);
        $m = (1 - $g - $k) / (1 - $k);
        $y = (1 - $b - $k) / (1 - $k);

        return self::clamp([$c * 100, $m * 100, $y * 100, $k * 100]);
    }

    /** @return array{0: float, 1: float, 2: float, 3: float} */
    private static function clamp(array $v): array
    {
        return [
            round(min(100.0, max(0.0, (float) $v[0])), 1),
            round(min(100.0, max(0.0, (float) $v[1])), 1),
            round(min(100.0, max(0.0, (float) $v[2])), 1),
            round(min(100.0, max(0.0, (float) $v[3])), 1),
        ];
    }

    /** "0 / 59 / 93 / 28" for a card or a spec sheet. */
    public static function label(array $cmyk): string
    {
        return implode(' / ', array_map(static fn (float $v): string => (string) round($v), $cmyk));
    }
}
