<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\CustomLabel;
use App\Models\Media;

/**
 * A pouch product in its sizes, made in one go (owner, 2026-11-11: "an easy
 * option for 3 sizes with photos"): one custom label per size, "Chicken Momo
 * (Small)", each a pouch label with its own size word, pieces and price and
 * the same photo, from a built-in pouch template. The controller keeps each
 * as a saved label at its own paper size, so printing is Print again.
 *
 * The name on the print is the product's: PouchDesign leaves the "(Small)"
 * off, since the panel says it.
 */
final class PouchSet
{
    /** The momo's three zip pouches (14, 16 and 18 cm wide), as the owner sells them. */
    public const DEFAULT_SIZES = [
        ['word' => 'Small', 'qty' => 6, 'price' => 35.0, 'preset' => 'r120x53'],
        ['word' => 'Medium', 'qty' => 8, 'price' => 45.0, 'preset' => 'r140x62'],
        ['word' => 'Large', 'qty' => 12, 'price' => 65.0, 'preset' => 'r160x70'],
    ];

    public const MAX_SIZES = 4;

    /** The photo that comes with the momo templates, under public/. */
    public const MOMO_PHOTO = 'brand/photos/momo/momo-plate.png';

    /** What a custom label takes from a template. */
    private const FIELDS = [
        'label_storage', 'label_heading', 'label_heading_dv', 'label_storage_line', 'label_storage_line_dv',
        'label_ingredients', 'label_ingredients_dv', 'label_how_to_use', 'label_how_to_use_dv', 'label_note', 'label_note_dv',
        'label_lang', 'label_shelf_life_days', 'label_pack_unit', 'label_net_weight', 'label_allergens',
    ];

    /**
     * The built-in templates a set can start from: the pouch ones.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function templates(): array
    {
        $out = [];
        foreach (LabelTemplates::BUILTIN as $t) {
            if (isset($t['fields']['label_pouch'])) {
                $out[$t['id']] = $t;
            }
        }

        return $out;
    }

    /**
     * What the Admin's form starts with.
     *
     * @return array{sizes: list<array{word: string, qty: int, price: float, preset: string}>, max_sizes: int, templates: list<array{id: string, name: string, has_photo: bool}>, photo_url: string}
     */
    public static function catalogue(): array
    {
        $templates = [];
        foreach (self::templates() as $t) {
            $templates[] = ['id' => $t['id'], 'name' => $t['name'], 'has_photo' => str_starts_with($t['id'], 'momo-')];
        }

        return ['sizes' => self::DEFAULT_SIZES, 'max_sizes' => self::MAX_SIZES, 'templates' => $templates, 'photo_url' => '/' . self::MOMO_PHOTO];
    }

    /** The momo photo as a library picture, kept once. */
    public static function momoPhoto(): ?Media
    {
        $file = public_path(self::MOMO_PHOTO);
        if (!is_file($file)) {
            return null;
        }
        try {
            return LabelMedia::storePng((string) file_get_contents($file), 'Momo pouch photo');
        } catch (\InvalidArgumentException) {
            return null;
        }
    }

    /**
     * One custom label per size.
     *
     * @param array{name: string, name_dv?: ?string, template?: ?string, look?: ?string, method?: ?string, pack_place?: ?string, photo_media_id?: ?int, sizes: list<array{word: string, qty?: ?int, price?: ?float, preset: string}>} $in
     * @return list<array{label: CustomLabel, preset: string}>
     */
    public static function create(array $in, ?int $userId): array
    {
        $template = self::templates()[$in['template'] ?? 'momo-pouch'] ?? self::templates()['momo-pouch'];
        $fields = array_intersect_key($template['fields'], array_flip(self::FIELDS));
        $pouch = PouchConfig::clean(array_filter(['look' => $in['look'] ?? null, 'method' => $in['method'] ?? null, 'pack_place' => $in['pack_place'] ?? null], fn ($v) => $v !== null && $v !== '') + $template['fields']['label_pouch']);
        $name = trim($in['name']);
        $out = [];
        foreach ($in['sizes'] as $size) {
            $word = trim((string) $size['word']);
            $label = CustomLabel::query()->create($fields + [
                'name' => mb_substr($word !== '' ? "{$name} ({$word})" : $name, 0, 80),
                'name_dv' => ($in['name_dv'] ?? null) ?: null,
                'label_pack_qty' => !empty($size['qty']) ? (int) $size['qty'] : null,
                'label_price' => isset($size['price']) && (float) $size['price'] > 0 ? (float) $size['price'] : null,
                'label_pouch' => ['size_word' => $word] + $pouch,
                'label_photo_media_id' => $in['photo_media_id'] ?? null,
                'created_by' => $userId,
            ]);
            $out[] = ['label' => $label, 'preset' => (string) $size['preset']];
        }

        return $out;
    }

    /** "Chicken Momo (Small)" prints as "Chicken Momo" when the panel already says Small. */
    public static function printName(string $name, string $sizeWord): string
    {
        $sizeWord = trim($sizeWord);
        $suffix = " ({$sizeWord})";
        if ($sizeWord !== '' && mb_strlen($name) > mb_strlen($suffix) && mb_strtolower(mb_substr($name, -mb_strlen($suffix))) === mb_strtolower($suffix)) {
            return rtrim(mb_substr($name, 0, -mb_strlen($suffix)));
        }

        return $name;
    }
}
