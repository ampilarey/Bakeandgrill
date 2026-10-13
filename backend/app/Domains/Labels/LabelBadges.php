<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\CustomLabel;
use App\Models\Item;
use Illuminate\Validation\Rule;

/**
 * Badges (round 9 of the usability work, owner, 2026-10-13: "badges you drop
 * on: Halal, Spicy, New, Gluten-free, drawn in the brand style").
 *
 * A fixed set of badges, each a word in English and Dhivehi, up to four per
 * product (`label_badges`), drawn by every design as a row of rust pills
 * with the word in cream, under the name, wherever the size leaves the
 * room: the full sticker, the compact one, the small sticker (upright and
 * wide), a round sticker from 60 mm and the wrap-around label's brand part.
 * Pills are rectangles and text, so the web sheet, the PDF and the thermal
 * rasteriser all draw them alike; a badge that does not fit its row is left
 * out rather than squeezed.
 */
final class LabelBadges
{
    public const MAX = 4;

    /** key → [the English word, the Dhivehi word]. */
    public const CATALOGUE = [
        'halal' => ['HALAL', 'ހަލާލް'],
        'spicy' => ['SPICY', 'ކުޅި'],
        'new' => ['NEW', 'އާ'],
        'gluten_free' => ['GLUTEN-FREE', 'ގްލޫޓަން ނުހިމެނޭ'],
        'vegan' => ['VEGAN', 'ވީގަން'],
        'vegetarian' => ['VEGETARIAN', 'ވެޖިޓޭރިއަން'],
        'sugar_free' => ['SUGAR-FREE', 'ހަކުރު ނުހިމެނޭ'],
        'dairy_free' => ['DAIRY-FREE', 'ކިރު ނުހިމެނޭ'],
        'nut_free' => ['NUT-FREE', 'ނަޓްސް ނުހިމެނޭ'],
        'homemade' => ['HOMEMADE', 'ގޭގައި ތައްޔާރުކުރި'],
        'best_seller' => ['BEST SELLER', 'އެންމެ ވިކޭ'],
    ];

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::CATALOGUE);
    }

    /**
     * The badges as the Admin lists them.
     *
     * @return list<array{key: string, label: string, word: string, word_dv: string}>
     */
    public static function catalogue(): array
    {
        $out = [];
        foreach (self::CATALOGUE as $key => [$en, $dv]) {
            $out[] = ['key' => $key, 'label' => ucfirst(mb_strtolower($en)), 'word' => $en, 'word_dv' => $dv];
        }

        return $out;
    }

    /** @return list<string> the product's badge keys, in the order picked */
    public static function of(Item|CustomLabel $product): array
    {
        return self::clean($product->label_badges);
    }

    /**
     * A typed or kept list, tidied: known keys once each in the order given,
     * at most MAX. Nothing gives [].
     *
     * @return list<string>
     */
    public static function clean(mixed $raw): array
    {
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : explode(',', $raw);
        }
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $key) {
            $key = trim((string) $key);
            if (isset(self::CATALOGUE[$key]) && !in_array($key, $out, true)) {
                $out[] = $key;
            }
            if (count($out) >= self::MAX) {
                break;
            }
        }

        return $out;
    }

    /**
     * The validation of a typed list under `$key`.
     *
     * @return array<string, mixed>
     */
    public static function rules(string $key = 'label_badges'): array
    {
        return [
            $key => 'sometimes|nullable|array|max:' . self::MAX,
            "$key.*" => ['string', Rule::in(self::keys())],
        ];
    }

    /**
     * What the sticker data carries: each badge with both words.
     *
     * @return list<array{key: string, en: string, dv: string}>
     */
    public static function for(Item|CustomLabel $product): array
    {
        return array_map(fn (string $key) => ['key' => $key, 'en' => self::CATALOGUE[$key][0], 'dv' => self::CATALOGUE[$key][1]], self::of($product));
    }

    /**
     * A row of pills across $w from $x, $h tall: each badge's word in cream
     * on a rust pill, centred, left or right; one that does not fit is left
     * out. Pieces only, no markers.
     *
     * @param list<array{key: string, en: string, dv: string}> $badges
     * @return list<array<string, mixed>>
     */
    public static function pills(array $badges, bool $dv, float $x, float $y, float $w, float $h, string $align = 'c'): array
    {
        if ($badges === []) {
            return [];
        }
        $font = $dv ? 'dv' : 'j7';
        $pt = round(min(7.0, max(3.4, $h * ($dv ? 1.15 : 0.95))), 2);
        $padX = round($h * 0.32, 2);
        $gap = round($h * 0.25, 2);
        $widths = [];
        $total = 0.0;
        foreach ($badges as $i => $b) {
            $word = $dv ? $b['dv'] : $b['en'];
            $pw = round(LabelText::widthMm($word, $pt, $font) + 2 * $padX, 2);
            if ($total + $pw + ($i > 0 ? $gap : 0.0) > $w) {
                break;
            }
            $widths[$i] = $pw;
            $total += $pw + ($i > 0 ? $gap : 0.0);
        }
        if ($widths === []) {
            return [];
        }
        $cx = match ($align) {
            'l' => $x,
            'r' => $x + $w - $total,
            default => $x + ($w - $total) / 2,
        };
        $p = [];
        foreach ($widths as $i => $pw) {
            $word = $dv ? $badges[$i]['dv'] : $badges[$i]['en'];
            $p[] = ['t' => 'rect', 'x' => round($cx, 3), 'y' => $y, 'w' => $pw, 'h' => $h, 'fill' => StickerDesign::PRIMARY, 'r' => round($h / 2, 2)];
            $p[] = ['t' => 'text', 'x' => round($cx, 3), 'base' => round($y + $h / 2 + 0.36 * $pt * LabelText::PT, 3), 'w' => $pw, 'align' => 'c', 'font' => $font, 'pt' => $pt, 'color' => StickerDesign::CREAM, 'text' => $word] + ($dv ? ['bold' => 0.5] : ['ls' => 0.04]);
            $cx += $pw + $gap;
        }

        return $p;
    }
}
