<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\CustomLabel;
use App\Models\Item;
use Illuminate\Validation\Rule;

/**
 * A pouch label (owner, 2026-11-11: the frozen momo's zip pouch; "make for
 * different type of background… there will be steam, frying and other types
 * also in the future… make it easy for different type of products"): a
 * landscape front-of-pack label with the dish in a circle, the Bake & Grill
 * logo, the name in a script face, a "how you cook it" pill, a panel with the
 * pack size, count and price, and a strip of ingredients, how to use, storage
 * with the dates and the complaints QR. PouchDesign draws it.
 *
 * Kept as JSON on the item or custom label (`label_pouch`); nothing kept is
 * an ordinary sticker. Two picks do the work: the look (what the pouch behind
 * the label is like) and the cooking method (the pill's words and icon, and
 * the how-to-use wording printed when the label has none of its own).
 */
final class PouchConfig
{
    /**
     * The looks, named after the pouch the label goes on. Each is a palette:
     * bg and border (the label), ink (name and text), accent (the tagline),
     * panel and its inks, pill and its ink, strip (the bottom band) and its
     * inks, ring (round the photo), and whether the logo is the cream one.
     */
    public const LOOKS = [
        'gold' => [
            'label' => 'Gold or yellow pouch', 'hint' => 'Cream label, dark brown frame, yellow highlights',
            'bg' => '#FFFBF3', 'border' => '#4A2412', 'ink' => '#4A2412', 'accent' => '#D9531E',
            'panel' => '#4A2412', 'panel_ink' => '#FFFFFF', 'panel_accent' => '#FFC72C',
            'pill' => '#FFC72C', 'pill_ink' => '#4A2412',
            'strip' => '#F5EBDB', 'strip_ink' => '#3A2416', 'strip_head' => '#4A2412',
            'ring' => '#FFC72C', 'dark_logo' => false,
        ],
        'clear' => [
            'label' => 'Clear or white pouch', 'hint' => 'White label in the brand rust',
            'bg' => '#FFFFFF', 'border' => '#B74B0C', 'ink' => '#1C1408', 'accent' => '#B74B0C',
            'panel' => '#B74B0C', 'panel_ink' => '#FFFFFF', 'panel_accent' => '#FFE7C7',
            'pill' => '#FEF3E8', 'pill_ink' => '#B74B0C',
            'strip' => '#FEF3E8', 'strip_ink' => '#3A2416', 'strip_head' => '#B74B0C',
            'ring' => '#B74B0C', 'dark_logo' => false,
        ],
        'kraft' => [
            'label' => 'Brown paper (kraft) pouch', 'hint' => 'Warm cream label with a deep green panel',
            'bg' => '#FBF6EA', 'border' => '#2F4A32', 'ink' => '#2B2117', 'accent' => '#B74B0C',
            'panel' => '#2F4A32', 'panel_ink' => '#FFFFFF', 'panel_accent' => '#F2D27A',
            'pill' => '#2F4A32', 'pill_ink' => '#FFFFFF',
            'strip' => '#EFE6D2', 'strip_ink' => '#2B2117', 'strip_head' => '#2F4A32',
            'ring' => '#2F4A32', 'dark_logo' => false,
        ],
        'dark' => [
            'label' => 'Black or dark pouch', 'hint' => 'Dark label with cream words and gold highlights',
            'bg' => '#1C1408', 'border' => '#E3B04B', 'ink' => '#FFF8EC', 'accent' => '#E3B04B',
            'panel' => '#E3B04B', 'panel_ink' => '#1C1408', 'panel_accent' => '#1C1408',
            'pill' => '#E3B04B', 'pill_ink' => '#1C1408',
            'strip' => '#2B2014', 'strip_ink' => '#F3E9D8', 'strip_head' => '#E3B04B',
            'ring' => '#E3B04B', 'dark_logo' => true,
        ],
        'mono' => [
            'label' => 'Black and white (label printer)', 'hint' => 'No colour: for a thermal printer or a photocopy',
            'bg' => '#FFFFFF', 'border' => '#000000', 'ink' => '#000000', 'accent' => '#000000',
            'panel' => '#000000', 'panel_ink' => '#FFFFFF', 'panel_accent' => '#FFFFFF',
            'pill' => '#000000', 'pill_ink' => '#FFFFFF',
            'strip' => '#FFFFFF', 'strip_ink' => '#000000', 'strip_head' => '#000000',
            'ring' => '#000000', 'dark_logo' => false,
        ],
    ];

    /**
     * How the food is cooked: the pill's words (English, Dhivehi), its icon
     * (PouchDesign::icon, null for none; the Dhivehi words are typed by the
     * owner, `method_text_dv`, so no drafted Dhivehi prints on a pack) and the how-to-use wording printed
     * when the label and its type have none. The times are a start: the
     * owner checks them against the real product.
     */
    public const METHODS = [
        'microwave' => ['Microwave & Eat', '', 'microwave', 'Open the zip slightly. Microwave from frozen for 2 to 3 minutes until steaming hot. Rest 1 minute before eating.'],
        'steam' => ['Steam & Eat', '', 'steam', 'Steam from frozen for 8 to 10 minutes until piping hot. Do not thaw first.'],
        'pan_fry' => ['Pan Fry', '', 'pan', 'Heat a little oil in a pan. Fry from frozen for 3 to 4 minutes each side until golden and hot through.'],
        'deep_fry' => ['Deep Fry', '', 'fryer', 'Deep fry from frozen in hot oil (170°C) for 4 to 5 minutes until golden. Drain well.'],
        'air_fry' => ['Air Fry', '', 'airfryer', 'Brush with a little oil. Air fry from frozen at 180°C for 8 to 10 minutes, turning once.'],
        'boil' => ['Boil & Eat', '', 'pot', 'Drop into boiling water from frozen. Simmer for 5 to 6 minutes until they float and are hot through.'],
        'bake' => ['Oven Bake', '', 'oven', 'Bake from frozen at 180°C for 12 to 15 minutes until golden and hot through.'],
        'ready' => ['Ready to Eat', '', null, 'Ready to eat. Best enjoyed fresh.'],
        'thaw' => ['Thaw & Serve', '', null, 'Thaw in the fridge for 4 hours. Serve chilled or at room temperature.'],
        'none' => ['', '', null, ''],
    ];

    public const DEFAULT_LOOK = 'gold';

    public const DEFAULT_METHOD = 'microwave';

    /** The smallest label the pouch design draws, and how much wider than tall it must be. */
    public const MIN_W = 90.0;

    public const MIN_H = 40.0;

    public const MIN_RATIO = 1.5;

    /**
     * The product's pouch config, tidied, or null when it prints as an ordinary sticker.
     *
     * @return ?array{look: string, method: string, method_text: string, method_text_dv: string, tagline: string, tagline_dv: string, size_word: string}
     */
    public static function of(Item|CustomLabel $product): ?array
    {
        $raw = $product->label_pouch;
        if (is_string($raw)) {
            $raw = json_decode($raw, true);
        }

        return is_array($raw) ? self::clean($raw) : null;
    }

    /**
     * @param array<string, mixed> $in
     * @return array{look: string, method: string, method_text: string, method_text_dv: string, tagline: string, tagline_dv: string, size_word: string}
     */
    public static function clean(array $in): array
    {
        $text = fn (string $key, int $max): string => mb_substr(trim((string) (is_scalar($in[$key] ?? null) ? $in[$key] : '')), 0, $max);
        $look = (string) (is_scalar($in['look'] ?? null) ? $in['look'] : '');
        $method = (string) (is_scalar($in['method'] ?? null) ? $in['method'] : '');

        return [
            'look' => isset(self::LOOKS[$look]) ? $look : self::DEFAULT_LOOK,
            'method' => isset(self::METHODS[$method]) ? $method : self::DEFAULT_METHOD,
            // The pill's own words, when the method's are not the ones wanted ("Steam or Fry").
            'method_text' => $text('method_text', 24),
            'method_text_dv' => $text('method_text_dv', 30),
            'tagline' => $text('tagline', 60),
            'tagline_dv' => $text('tagline_dv', 60),
            // SMALL, MEDIUM, LARGE over the count; blank takes the size being printed, when the item has sizes.
            'size_word' => $text('size_word', 14),
        ];
    }

    /** Whether a label this size and shape can be drawn as a pouch label. */
    public static function fits(string $shape, float $w, float $h): bool
    {
        return $shape === 'rect' && $w >= self::MIN_W && $h >= self::MIN_H && $w >= $h * self::MIN_RATIO;
    }

    /** @return array<string, mixed> */
    public static function rules(string $key = 'label_pouch'): array
    {
        return [
            $key => 'sometimes|nullable|array',
            "$key.look" => ['sometimes', 'nullable', Rule::in(array_keys(self::LOOKS))],
            "$key.method" => ['sometimes', 'nullable', Rule::in(array_keys(self::METHODS))],
            "$key.method_text" => 'sometimes|nullable|string|max:24',
            "$key.method_text_dv" => 'sometimes|nullable|string|max:30',
            "$key.tagline" => 'sometimes|nullable|string|max:60',
            "$key.tagline_dv" => 'sometimes|nullable|string|max:60',
            "$key.size_word" => 'sometimes|nullable|string|max:14',
        ];
    }

    /**
     * The looks and methods as the Admin lists them.
     *
     * @return array{looks: list<array<string, mixed>>, methods: list<array{key: string, label: string, how: string}>, default_look: string, default_method: string, min_w: float, min_h: float, min_ratio: float}
     */
    public static function catalogue(): array
    {
        $looks = [];
        foreach (self::LOOKS as $key => $l) {
            $looks[] = ['key' => $key, 'label' => $l['label'], 'hint' => $l['hint'], 'bg' => $l['bg'], 'border' => $l['border'], 'panel' => $l['panel'], 'pill' => $l['pill']];
        }
        $methods = [];
        foreach (self::METHODS as $key => [$en, , , $how]) {
            $methods[] = ['key' => $key, 'label' => $key === 'none' ? 'Nothing (no pill)' : $en, 'how' => $how];
        }

        return ['looks' => $looks, 'methods' => $methods, 'default_look' => self::DEFAULT_LOOK, 'default_method' => self::DEFAULT_METHOD, 'min_w' => self::MIN_W, 'min_h' => self::MIN_H, 'min_ratio' => self::MIN_RATIO];
    }
}
