<?php

declare(strict_types=1);

namespace App\Domains\Labels;

/**
 * Allergen pictograms for the full pack sticker and the pack's page
 * (2026-10-12): a row of small drawn symbols with the word beneath, so an
 * allergen is seen before the ingredients are read. Drawn here as SVG in
 * the brand rust on a cream disc; the sticker gets them as data URIs (the
 * PDF never fetches anything), the web page inline. An allergen with no
 * symbol still prints in the "Contains …" note.
 */
final class AllergenIcons
{
    /** A spice level from the menu's Details tab that earns the chilli. */
    public const SPICY_LEVELS = ['medium', 'hot', 'extra_hot'];

    /** How many fit the sticker's row (12 mm each across 95 mm). */
    public const MAX = 7;

    /**
     * Allergen words as the Details tab and a custom label type them → the
     * symbol. Matched whole, after "tree-nuts" became "tree nuts".
     */
    private const WORDS = [
        'egg' => 'egg', 'eggs' => 'egg',
        'milk' => 'milk', 'dairy' => 'milk', 'lactose' => 'milk', 'cheese' => 'milk', 'butter' => 'milk', 'cream' => 'milk', 'yoghurt' => 'milk', 'yogurt' => 'milk',
        'gluten' => 'gluten', 'wheat' => 'gluten', 'flour' => 'gluten', 'barley' => 'gluten', 'rye' => 'gluten', 'oats' => 'gluten', 'cereals' => 'gluten',
        'nuts' => 'nuts', 'nut' => 'nuts', 'tree nuts' => 'nuts', 'almond' => 'nuts', 'almonds' => 'nuts', 'cashew' => 'nuts', 'cashews' => 'nuts',
        'walnut' => 'nuts', 'walnuts' => 'nuts', 'pistachio' => 'nuts', 'pistachios' => 'nuts', 'hazelnut' => 'nuts', 'hazelnuts' => 'nuts', 'pecans' => 'nuts',
        'peanut' => 'peanut', 'peanuts' => 'peanut', 'groundnut' => 'peanut', 'groundnuts' => 'peanut',
        'soy' => 'soy', 'soya' => 'soy', 'soybean' => 'soy', 'soybeans' => 'soy', 'tofu' => 'soy',
        'fish' => 'fish', 'tuna' => 'fish', 'anchovy' => 'fish', 'anchovies' => 'fish',
        'shellfish' => 'shellfish', 'crustaceans' => 'shellfish', 'crustacean' => 'shellfish', 'prawn' => 'shellfish', 'prawns' => 'shellfish',
        'shrimp' => 'shellfish', 'shrimps' => 'shellfish', 'crab' => 'shellfish', 'lobster' => 'shellfish', 'molluscs' => 'shellfish', 'mollusks' => 'shellfish', 'squid' => 'shellfish',
        'sesame' => 'sesame', 'sesame seeds' => 'sesame',
        'mustard' => 'mustard',
        'celery' => 'celery',
    ];

    /** The word under each symbol. */
    private const CAPTIONS = [
        'egg' => 'EGG', 'milk' => 'MILK', 'gluten' => 'GLUTEN', 'nuts' => 'NUTS', 'peanut' => 'PEANUTS', 'soy' => 'SOY',
        'fish' => 'FISH', 'shellfish' => 'SHELLFISH', 'sesame' => 'SESAME', 'mustard' => 'MUSTARD', 'celery' => 'CELERY', 'chilli' => 'SPICY',
    ];

    /**
     * The symbols, drawn in a 24-unit box inside the disc (nothing outside
     * 4…20): plain shapes and paths, which both the browser and dompdf draw.
     */
    private const GLYPHS = [
        'egg' => '<ellipse cx="12" cy="13" rx="5" ry="6.4"/>',
        'milk' => '<path d="M9.2 5h5.6v2.4l1.6 2.6V19H7.6V10l1.6-2.6z"/><path d="M7.6 13h9.8"/>',
        'gluten' => '<path d="M12 19.5v-6"/><path d="M12 13.5c-2.8-.4-4.3-2.3-4.3-4.6 2.4 0 4.3 1.6 4.3 4.6z"/><path d="M12 13.5c2.8-.4 4.3-2.3 4.3-4.6-2.4 0-4.3 1.6-4.3 4.6z"/><path d="M12 9.4c-2.4-.4-3.8-2-3.8-4.4 2.2 0 3.8 1.5 3.8 4.4z"/><path d="M12 9.4c2.4-.4 3.8-2 3.8-4.4-2.2 0-3.8 1.5-3.8 4.4z"/>',
        'nuts' => '<path d="M12 5c3.3 0 5.6 2 5.6 4.6 0 .9-.3 1.7-.9 2.3v1.3c0 3.2-2 5.8-4.7 5.8s-4.7-2.6-4.7-5.8v-1.3c-.6-.6-.9-1.4-.9-2.3C6.4 7 8.7 5 12 5z"/><path d="M7.4 11.9h9.2"/>',
        'peanut' => '<path d="M8.6 6.2c1.9 0 3.2 1.4 3.4 3.1.2 1.8 1.6 2.6 3.1 2.8 1.9.3 3.1 1.7 3.1 3.4 0 1.9-1.6 3.4-3.6 3.4-1.8 0-3-1.3-3.3-2.9-.3-1.8-1.5-2.7-3.1-2.9C6.4 12.9 5.2 11.6 5.2 9.7c0-1.9 1.5-3.5 3.4-3.5z"/><path d="M9.4 9.3l1.1 1.1M14.4 14.2l1.1 1.1"/>',
        'soy' => '<path d="M6 18c0-6.2 4.1-11 11.6-12.2C18.4 13 14 18 6 18z"/><circle cx="9.8" cy="14" r="1.1"/><circle cx="13" cy="10.4" r="1.1"/>',
        'fish' => '<path d="M4.5 12c2.6-3.6 5.4-5.4 8.8-5.4 2.7 0 4.9 2.1 6.2 5.4-1.3 3.3-3.5 5.4-6.2 5.4-3.4 0-6.2-1.8-8.8-5.4z"/><path d="M16.5 12l3.2-3.4v6.8z"/><circle cx="8.6" cy="11" r=".9"/>',
        'shellfish' => '<path d="M6 9.6c1.8-2.6 4.4-3.8 7.6-3.8 2.8 0 4.6 1.8 4.6 4.2 0 2.5-1.9 4.3-4.6 4.3h-1.5l-.9 4.7H8.8l.9-4.7C7.4 14.3 6 12.3 6 9.6z"/><path d="M13.2 5.8l2.4-1.6M14.8 6.6l2.8-.8"/>',
        'sesame' => '<ellipse cx="8.4" cy="8.8" rx="1.7" ry="2.6"/><ellipse cx="14.6" cy="7.8" rx="1.7" ry="2.6"/><ellipse cx="12" cy="13.2" rx="1.7" ry="2.6"/><ellipse cx="7.6" cy="15.6" rx="1.7" ry="2.6"/><ellipse cx="16" cy="15" rx="1.7" ry="2.6"/>',
        'mustard' => '<path d="M9.4 5.6h5.2v2.2l1.8 2.4V19H7.6v-8.8l1.8-2.4z"/><path d="M7.6 12.6h8.8"/><circle cx="12" cy="15.6" r="1.1"/>',
        'celery' => '<path d="M9.4 18.6V9.2c0-1.8.9-3 2.6-4 1.7 1 2.6 2.2 2.6 4v9.4z"/><path d="M12 18.6v-7"/><path d="M9.4 11.2L6.6 8.6M14.6 11.2l2.8-2.6"/>',
        'chilli' => '<path d="M15.4 4.6c1.1 1.3 1.1 2.6.2 3.8"/><path d="M15.6 8.4c-2.4-.2-3.9 1.9-4.9 4.9-1 3-2.9 5.5-6.3 6.1 3.3-1.4 4.9-4 5.8-7 .9-3 2.5-5.7 5.4-4z"/>',
    ];

    /**
     * The symbols for a product's allergens, in the order the allergens were
     * typed, each once, up to MAX, the chilli last when the item is spicy.
     *
     * @param list<string> $allergens from StickerSheet::allergens()
     * @return list<array{key: string, caption: string, src: string}>
     */
    public static function for(array $allergens, bool $spicy = false): array
    {
        $out = [];
        foreach (self::keys($allergens, $spicy) as $key) {
            $out[] = ['key' => $key, 'caption' => self::CAPTIONS[$key], 'src' => self::dataUri($key)];
        }

        return $out;
    }

    /**
     * @param list<string> $allergens
     * @return list<string>
     */
    public static function keys(array $allergens, bool $spicy = false): array
    {
        $keys = [];
        foreach ($allergens as $word) {
            $key = self::WORDS[mb_strtolower(trim((string) $word))] ?? null;
            if ($key !== null && !in_array($key, $keys, true)) {
                $keys[] = $key;
            }
        }
        if ($spicy) {
            $keys[] = 'chilli';
        }

        return array_slice($keys, 0, self::MAX);
    }

    public static function caption(string $key): string
    {
        return self::CAPTIONS[$key] ?? mb_strtoupper($key);
    }

    /** The symbol as an SVG, $px wide, for the web page. */
    public static function svg(string $key, int $px = 40): string
    {
        $glyph = self::GLYPHS[$key] ?? '';

        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' . $px . '" height="' . $px . '" role="img" aria-label="' . e(self::caption($key)) . '">'
            . '<circle cx="12" cy="12" r="11.2" fill="' . StickerDesign::CREAM . '" stroke="' . StickerDesign::PRIMARY . '" stroke-width="1.1"/>'
            . '<g fill="none" stroke="' . StickerDesign::PRIMARY . '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' . $glyph . '</g>'
            . '</svg>';
    }

    /**
     * For the sticker: the picture's width and height equal its drawing
     * units, because dompdf draws an SVG in user units and does not scale
     * a viewBox to its declared size (a 96 px picture of a 24-unit drawing
     * came out a quarter size in the corner). The img box scales the whole.
     */
    public static function dataUri(string $key): string
    {
        return 'data:image/svg+xml;base64,' . base64_encode(self::svg($key, 24));
    }
}
