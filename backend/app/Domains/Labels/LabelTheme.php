<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use Illuminate\Validation\Rule;

/**
 * A label's colours, picked in one tap (owner, 2026-11-27: "add more nice themes to each template and custom
 * labels also"). Every design draws in the brand's rust and brown (the constants on StickerDesign); a theme is
 * those colours exchanged for another set once the label is drawn, so every design, size and template takes
 * every theme and none of them knows about it. The paper stays white, words stay black (crispInk), and the
 * barcode and the QR codes are pictures the theme never touches, so a till can still scan them.
 *
 * A pouch label has colours of its own (PouchConfig::LOOKS) and is left alone. A new theme is a row here and in
 * THEME_FALLBACK (labelTheme.ts); never a colour typed into a design.
 */
final class LabelTheme
{
    public const DEFAULT = 'rust';

    /**
     * accent: headings, rules, the border; tint: a panel's ground; dark: a dark band or box; on_dark: the accent on
     * that dark; on_accent(_soft): small words on the accent. Each accent holds 4.5:1 on white and on its tint.
     *
     * @var array<string, array<string, string>>
     */
    public const THEMES = [
        'rust' => ['name' => 'Rust', 'accent' => '#B74B0C', 'tint' => '#FEF3E8', 'dark' => '#1C1408', 'border' => '#EDE4D4', 'muted' => '#8B7355', 'on_dark' => '#C56F3D', 'soft' => '#CDBFA8', 'on_accent' => '#FFE3CF', 'on_accent_soft' => '#F4CBB0'],
        'forest' => ['name' => 'Forest', 'accent' => '#1F6B3A', 'tint' => '#EDF6EE', 'dark' => '#0F2416', 'border' => '#D5E6D8', 'muted' => '#5C7463', 'on_dark' => '#7FC796', 'soft' => '#B9CDBE', 'on_accent' => '#DDF3E2', 'on_accent_soft' => '#BFE3C8'],
        'ocean' => ['name' => 'Ocean', 'accent' => '#0F5E8C', 'tint' => '#E9F3F9', 'dark' => '#0A1E2C', 'border' => '#CFE2EE', 'muted' => '#5B7486', 'on_dark' => '#6DB6E0', 'soft' => '#B5C9D6', 'on_accent' => '#DCEEF8', 'on_accent_soft' => '#BBDAEC'],
        'teal' => ['name' => 'Lagoon', 'accent' => '#0E6F6B', 'tint' => '#E6F4F3', 'dark' => '#082523', 'border' => '#CCE5E3', 'muted' => '#56716F', 'on_dark' => '#63C7C1', 'soft' => '#B2CECC', 'on_accent' => '#D9F2F0', 'on_accent_soft' => '#B7E0DD'],
        'gold' => ['name' => 'Gold', 'accent' => '#8A6400', 'tint' => '#FBF3DC', 'dark' => '#241A05', 'border' => '#EADFB8', 'muted' => '#7C6B3F', 'on_dark' => '#E0B84A', 'soft' => '#D3C69C', 'on_accent' => '#FBEFC8', 'on_accent_soft' => '#EEDB9E'],
        'chilli' => ['name' => 'Chilli', 'accent' => '#B3261E', 'tint' => '#FDECEA', 'dark' => '#2B0B09', 'border' => '#F0D3D0', 'muted' => '#8A5B57', 'on_dark' => '#EE7D75', 'soft' => '#D9B9B6', 'on_accent' => '#FFE0DD', 'on_accent_soft' => '#F5C2BD'],
        'berry' => ['name' => 'Berry', 'accent' => '#8E1F3F', 'tint' => '#FBECEF', 'dark' => '#2A0B14', 'border' => '#EDD3DA', 'muted' => '#86596A', 'on_dark' => '#E38CA3', 'soft' => '#D6B8C1', 'on_accent' => '#FBDDE5', 'on_accent_soft' => '#F0BFCC'],
        'plum' => ['name' => 'Plum', 'accent' => '#5B3A8C', 'tint' => '#F1ECF8', 'dark' => '#1B1230', 'border' => '#DDD3EC', 'muted' => '#6E6185', 'on_dark' => '#B79AE3', 'soft' => '#C5BAD8', 'on_accent' => '#E9DEF8', 'on_accent_soft' => '#D3C1EE'],
        'cocoa' => ['name' => 'Cocoa', 'accent' => '#6B4226', 'tint' => '#F6EEE7', 'dark' => '#22140A', 'border' => '#E5D7CA', 'muted' => '#7D6A5B', 'on_dark' => '#D3A27C', 'soft' => '#CDBBAB', 'on_accent' => '#F4E3D5', 'on_accent_soft' => '#E4CBB6'],
        'charcoal' => ['name' => 'Charcoal', 'accent' => '#333333', 'tint' => '#F1F1F1', 'dark' => '#111111', 'border' => '#DDDDDD', 'muted' => '#6B6B6B', 'on_dark' => '#D0D0D0', 'soft' => '#C4C4C4', 'on_accent' => '#F2F2F2', 'on_accent_soft' => '#DADADA'],
        // For a one-colour label printer: nothing but black, and no panel grounds for it to turn into grey dots.
        'mono' => ['name' => 'Black and white', 'accent' => '#000000', 'tint' => '#FFFFFF', 'dark' => '#000000', 'border' => '#000000', 'muted' => '#000000', 'on_dark' => '#FFFFFF', 'soft' => '#FFFFFF', 'on_accent' => '#FFFFFF', 'on_accent_soft' => '#FFFFFF'],
    ];

    /** A known theme other than the usual one, else null (which is what a label with no theme keeps). */
    public static function clean(mixed $key): ?string
    {
        $key = is_string($key) ? strtolower(trim($key)) : '';

        return $key !== self::DEFAULT && isset(self::THEMES[$key]) ? $key : null;
    }

    /** The theme a menu item's or a custom label's sticker prints in. */
    public static function of(object $item): string
    {
        return self::clean($item->label_theme ?? null) ?? self::DEFAULT;
    }

    /** @return array<string, list<mixed>> */
    public static function rules(string $key = 'label_theme'): array
    {
        return [$key => ['sometimes', 'nullable', Rule::in(array_keys(self::THEMES))]];
    }

    /**
     * For the screens: each theme with the colours its chip is drawn in.
     *
     * @return list<array{key: string, name: string, accent: string, tint: string, dark: string}>
     */
    public static function catalogue(): array
    {
        $out = [];
        foreach (self::THEMES as $key => $t) {
            $out[] = ['key' => $key, 'name' => $t['name'], 'accent' => $t['accent'], 'tint' => $t['tint'], 'dark' => $t['dark']];
        }

        return $out;
    }

    /**
     * The drawn pieces in a theme's colours.
     *
     * @param list<array<string, mixed>> $pieces
     * @return list<array<string, mixed>>
     */
    public static function apply(array $pieces, ?string $key): array
    {
        $key = self::clean($key);
        if ($key === null) {
            return $pieces;
        }
        $t = self::THEMES[$key];
        $map = [
            StickerDesign::PRIMARY => $t['accent'],
            StickerDesign::TINT => $t['tint'],
            StickerDesign::DARK => $t['dark'],
            StickerDesign::BORDER => $t['border'],
            StickerDesign::MUTED => $t['muted'],
            StickerDesign::ON_DARK => $t['on_dark'],
            StickerDesign::SOFT => $t['soft'],
            StickerDesign::ON_RUST => $t['on_accent'],
            StickerDesign::ON_RUST_SOFT => $t['on_accent_soft'],
        ];
        foreach ($pieces as &$p) {
            foreach (['color', 'fill', 'stroke'] as $k) {
                if (is_string($p[$k] ?? null) && isset($map[strtoupper($p[$k])])) {
                    $p[$k] = $map[strtoupper($p[$k])];
                }
            }
        }
        unset($p);

        return $pieces;
    }
}
