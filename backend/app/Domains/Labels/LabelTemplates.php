<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\LabelBrand;
use App\Models\LabelFooter;
use App\Models\LabelTemplate;
use App\Models\LabelType;
use App\Models\Media;
use Illuminate\Validation\Rule;

/**
 * Label templates (round 7 of the usability work, owner, 2026-10-13: "Start
 * from a saved label or a built-in template, and Save as template from any
 * label, so a new sauce takes thirty seconds").
 *
 * A template is a label's settings without the product itself: the brand,
 * type, storage, wording, shelf life, pack unit, bottom strip, language, wrap
 * parts, and the size it printed at; never the name, pictures, barcode or
 * price. The built-in ones (BUILTIN) come with the system; saved ones are
 * made from any label with Save as template and kept in `label_templates`.
 * Starting from one fills a new custom label's or a menu item's boxes; the
 * Admin does the filling (labelTemplates.ts), the server keeps them tidy.
 */
final class LabelTemplates
{
    /** What a template may hold: a menu item's and a custom label's settings together. */
    public const KEYS = [
        'brand_id', 'label_type_id', 'label_storage',
        'label_heading', 'label_heading_dv', 'label_storage_line', 'label_storage_line_dv',
        'label_ingredients', 'label_ingredients_dv', 'label_how_to_use', 'label_how_to_use_dv', 'label_note', 'label_note_dv',
        'footer_id', 'label_show_qr', 'label_lang',
        'label_shelf_life_days', 'label_pack_qty', 'label_pack_unit', 'label_net_weight', 'label_allergens',
        'label_nutrition', 'label_nutrition_per', 'label_wrap', 'label_show_price', 'label_show_nutrition', 'label_layout',
    ];

    public const NAME_MAX = 60;

    public const SOURCE_MAX = 80;

    /**
     * The templates that come with the system, in everyday words. Each sets
     * the storage, a heading, how to use and a note where the kind of food
     * asks for one, the shelf life, the pack unit and a size; the storage
     * lines and the bottom strip follow the usual wording, so the owner's
     * settings still apply.
     */
    public const BUILTIN = [
        [
            'id' => 'frozen-pack', 'name' => 'Frozen pack', 'blurb' => 'A frozen pack of hedhika or dough: 90 days frozen, thaw and cook.',
            'fields' => ['label_storage' => 'frozen', 'label_how_to_use' => 'Thaw for 10 minutes. Cook until piping hot.', 'label_shelf_life_days' => 90, 'label_pack_unit' => 'PCS', 'label_lang' => 'en'],
            'size' => ['shape' => 'rect', 'preset' => 'r105x148', 'on' => 'sheet'],
        ],
        [
            'id' => 'sauce-jar', 'name' => 'Sauce or dip in a jar', 'blurb' => 'A chilled sauce, dip or chutney in a jar: 14 days in the fridge.',
            'fields' => ['label_storage' => 'chilled', 'label_heading' => 'HOMEMADE SAUCE', 'label_how_to_use' => 'Stir before use. Keep refrigerated after opening.', 'label_note' => 'Use within 5 days of opening.', 'label_shelf_life_days' => 14, 'label_pack_unit' => 'G', 'label_net_weight' => '250 g', 'label_nutrition_per' => 'g', 'label_lang' => 'en'],
            'size' => ['shape' => 'rect', 'preset' => 'r60x40', 'on' => 'sheet'],
        ],
        [
            'id' => 'drink-bottle', 'name' => 'Drink in a bottle', 'blurb' => 'A fresh juice or drink: a wrap-around label with the nutrition, dates and recycling marks.',
            'fields' => [
                'label_storage' => 'chilled', 'label_heading' => 'FRESH JUICE', 'label_how_to_use' => 'Shake well. Serve chilled.', 'label_note' => 'No added sugar. Natural separation is normal.',
                'label_shelf_life_days' => 3, 'label_pack_unit' => 'ML', 'label_net_weight' => '500 ml', 'label_nutrition_per' => 'ml', 'label_lang' => 'en',
                'label_wrap' => ['parts' => ['brand', 'legal', 'nutrition', 'dates', 'barcode', 'qr', 'marks'], 'band' => true, 'marks' => ['recycle', 'dispose', 'pet']],
            ],
            'size' => ['shape' => 'rect', 'preset' => 'r180x40', 'on' => 'sheet'],
        ],
        [
            'id' => 'baked-goods', 'name' => 'Baked goods', 'blurb' => 'Bread, buns and cakes: best within two days, warmed before serving.',
            'fields' => ['label_storage' => 'ambient', 'label_heading' => 'FRESHLY BAKED', 'label_how_to_use' => 'Best enjoyed the day it is baked. Warm for 5 minutes before serving.', 'label_shelf_life_days' => 2, 'label_pack_unit' => 'PCS', 'label_lang' => 'en'],
            'size' => ['shape' => 'rect', 'preset' => 'r99x70', 'on' => 'sheet'],
        ],
        [
            'id' => 'dry-mix', 'name' => 'Dry mix or spice', 'blurb' => 'A spice blend, a dry mix, tea or rice: six months in a cool, dry place.',
            'fields' => ['label_storage' => 'ambient', 'label_heading' => 'DRY MIX', 'label_how_to_use' => 'Store away from sunlight. Reseal after opening.', 'label_shelf_life_days' => 180, 'label_pack_unit' => 'G', 'label_net_weight' => '100 g', 'label_nutrition_per' => 'g', 'label_lang' => 'en'],
            'size' => ['shape' => 'rect', 'preset' => 'r60x40', 'on' => 'sheet'],
        ],
        [
            'id' => 'gift-pack', 'name' => 'Gift pack or hamper', 'blurb' => 'A box of assorted things for a gift: a big sticker with a note.',
            'fields' => ['label_storage' => 'ambient', 'label_heading' => 'GIFT PACK', 'label_note' => 'Packed with care. Keep cool and dry.', 'label_shelf_life_days' => 14, 'label_pack_unit' => 'PACK', 'label_lang' => 'en'],
            'size' => ['shape' => 'rect', 'preset' => 'r105x148', 'on' => 'sheet'],
        ],
        [
            'id' => 'jar-lid', 'name' => 'Jar lid (round)', 'blurb' => 'A round sticker for a lid or a seal: the name, the brand and the dates.',
            'fields' => ['label_storage' => 'chilled', 'label_heading' => 'HOMEMADE', 'label_shelf_life_days' => 30, 'label_pack_unit' => 'G', 'label_lang' => 'en'],
            'size' => ['shape' => 'circle', 'preset' => 'c60', 'on' => 'sheet'],
        ],
    ];

    /**
     * The validation of a template's fields, each optional and nullable,
     * under `fields.` (or any prefix): the same limits a custom label and a
     * menu item's label hold their boxes to.
     *
     * @return array<string, mixed>
     */
    public static function rules(string $prefix = 'fields.'): array
    {
        $rules = [
            'brand_id' => 'nullable|integer|exists:label_brands,id',
            'label_type_id' => 'nullable|integer|exists:label_types,id',
            'label_storage' => ['nullable', Rule::in(LabelSettings::STORAGES)],
            'label_heading' => 'nullable|string|max:40',
            'label_heading_dv' => 'nullable|string|max:40',
            'label_storage_line' => 'nullable|string|max:160',
            'label_storage_line_dv' => 'nullable|string|max:160',
            'label_ingredients' => 'nullable|string|max:500',
            'label_ingredients_dv' => 'nullable|string|max:500',
            'label_how_to_use' => 'nullable|string|max:200',
            'label_how_to_use_dv' => 'nullable|string|max:200',
            'label_note' => 'nullable|string|max:120',
            'label_note_dv' => 'nullable|string|max:120',
            'footer_id' => 'nullable|integer|exists:label_footers,id',
            'label_show_qr' => 'nullable|boolean',
            'label_lang' => ['nullable', Rule::in(StickerSheet::LANGS)],
            'label_shelf_life_days' => 'nullable|integer|min:1|max:730',
            'label_pack_qty' => 'nullable|integer|min:1|max:9999',
            'label_pack_unit' => 'nullable|string|max:10',
            'label_net_weight' => 'nullable|string|max:20',
            'label_allergens' => 'nullable|string|max:200',
            'label_nutrition' => 'nullable|string|max:200',
            'label_nutrition_per' => ['nullable', Rule::in(['g', 'ml'])],
            'label_show_price' => 'nullable|boolean',
            'label_show_nutrition' => 'nullable|boolean',
        ];
        $out = [];
        foreach ($rules as $key => $rule) {
            $out[$prefix . $key] = is_array($rule) ? array_merge(['sometimes'], $rule) : 'sometimes|' . $rule;
        }

        return $out + WrapConfig::rules($prefix . 'label_wrap') + LabelLayout::rules($prefix . 'label_layout');
    }

    /**
     * A template's fields as they are kept: only KEYS, strings trimmed and
     * blank ones null, numbers and switches typed, the wrap config tidied.
     * A key left out is left out (starting from it leaves that box alone);
     * one sent null blanks the box.
     *
     * @param array<string, mixed> $in
     * @return array<string, mixed>
     */
    public static function normaliseFields(array $in): array
    {
        $out = [];
        foreach (self::KEYS as $key) {
            if (!array_key_exists($key, $in)) {
                continue;
            }
            $v = $in[$key];
            if ($key === 'label_wrap') {
                $out[$key] = is_array($v) ? WrapConfig::clean($v) : null;
            } elseif ($key === 'label_layout') {
                $out[$key] = is_array($v) ? (LabelLayout::clean($v) ?: null) : null;
            } elseif (in_array($key, ['label_show_qr', 'label_show_price', 'label_show_nutrition'], true)) {
                $out[$key] = $v === null || $v === '' ? null : filter_var($v, FILTER_VALIDATE_BOOLEAN);
            } elseif (in_array($key, ['brand_id', 'label_type_id', 'footer_id', 'label_shelf_life_days', 'label_pack_qty'], true)) {
                $out[$key] = $v === null || $v === '' ? null : (int) $v;
            } elseif (is_string($v)) {
                $v = trim($v);
                $out[$key] = $v === '' ? null : $v;
            } else {
                $out[$key] = $v === null || !is_scalar($v) ? null : (string) $v;
            }
        }

        return $out;
    }

    /**
     * The size a template printed at, as the Admin's picker holds it, or null
     * for one that cannot print (LabelRolls has the rules: a known preset of
     * the same shape, a stock it offers, a typed size the sheet accepts).
     *
     * @return ?array{shape: string, preset: string, on: string, w: float, h: float}
     */
    public static function normaliseSize(mixed $size): ?array
    {
        if (!is_array($size)) {
            return null;
        }
        $rows = LabelRolls::normalise([['id' => 'size', 'name' => ''] + $size]);
        if ($rows === []) {
            return null;
        }
        $r = $rows[0];

        return ['shape' => $r['shape'], 'preset' => $r['preset'], 'on' => $r['on'], 'w' => $r['w'], 'h' => $r['h']];
    }

    /**
     * The names behind the ids a set of templates carry, read once for a
     * whole list: types (with their storage), brands and footers.
     *
     * @param list<array<string, mixed>> $fieldSets
     * @return array{types: \Illuminate\Support\Collection<int, LabelType>, brands: \Illuminate\Support\Collection<int, string>, footers: \Illuminate\Support\Collection<int, string>}
     */
    public static function names(array $fieldSets): array
    {
        $ids = fn (string $key): array => array_values(array_unique(array_filter(array_map(fn (array $f) => isset($f[$key]) ? (int) $f[$key] : 0, $fieldSets))));

        return [
            'types' => LabelType::query()->whereIn('id', $ids('label_type_id'))->get(['id', 'name', 'storage'])->keyBy('id'),
            'brands' => LabelBrand::query()->whereIn('id', $ids('brand_id'))->pluck('name', 'id'),
            'footers' => LabelFooter::query()->whereIn('id', $ids('footer_id'))->pluck('name', 'id'),
        ];
    }

    /**
     * A saved template as the Admin reads it.
     *
     * @param array{types: \Illuminate\Support\Collection<int, LabelType>, brands: \Illuminate\Support\Collection<int, string>, footers: \Illuminate\Support\Collection<int, string>} $names
     * @return array<string, mixed>
     */
    public static function present(LabelTemplate $t, array $names): array
    {
        $t->loadMissing('creator:id,name');

        return self::row((int) $t->id, false, $t->name, null, $t->source, is_array($t->fields) ? $t->fields : [], is_array($t->size) ? $t->size : null, $names)
            + ['created_by' => $t->creator?->name, 'created_at' => $t->created_at?->toIso8601String()];
    }

    /**
     * A built-in template as the Admin reads it: the same shape, a string id.
     *
     * @param array{id: string, name: string, blurb: string, fields: array<string, mixed>, size: array<string, mixed>} $builtin
     * @param array{types: \Illuminate\Support\Collection<int, LabelType>, brands: \Illuminate\Support\Collection<int, string>, footers: \Illuminate\Support\Collection<int, string>} $names
     * @return array<string, mixed>
     */
    public static function presentBuiltin(array $builtin, array $names): array
    {
        return self::row($builtin['id'], true, $builtin['name'], $builtin['blurb'], null, self::normaliseFields($builtin['fields']), self::normaliseSize($builtin['size']), $names)
            + ['created_by' => null, 'created_at' => null];
    }

    /**
     * @param array<string, mixed> $fields
     * @param ?array<string, mixed> $size
     * @param array{types: \Illuminate\Support\Collection<int, LabelType>, brands: \Illuminate\Support\Collection<int, string>, footers: \Illuminate\Support\Collection<int, string>} $names
     * @return array<string, mixed>
     */
    private static function row(int|string $id, bool $builtin, string $name, ?string $blurb, ?string $source, array $fields, ?array $size, array $names): array
    {
        // A type, brand or footer removed since the template was saved: the box starts blank.
        $type = isset($fields['label_type_id']) ? $names['types']->get((int) $fields['label_type_id']) : null;
        if (array_key_exists('label_type_id', $fields) && $type === null) {
            $fields['label_type_id'] = null;
        }
        $brand = isset($fields['brand_id']) ? $names['brands']->get((int) $fields['brand_id']) : null;
        if (array_key_exists('brand_id', $fields) && $brand === null) {
            $fields['brand_id'] = null;
        }
        $footer = isset($fields['footer_id']) ? $names['footers']->get((int) $fields['footer_id']) : null;
        if (array_key_exists('footer_id', $fields) && $footer === null) {
            $fields['footer_id'] = null;
        }
        $wrap = isset($fields['label_wrap']) && is_array($fields['label_wrap']) ? WrapConfig::clean($fields['label_wrap']) : null;
        if ($wrap !== null) {
            $fields['label_wrap'] = $wrap;
        }
        $pictures = [];
        if ($wrap !== null && $wrap['pictures'] !== []) {
            $media = Media::query()->whereIn('id', $wrap['pictures'])->get()->keyBy('id');
            $pictures = array_map(fn (int $mid) => ['id' => $mid, 'url' => $media->get($mid)?->url], $wrap['pictures']);
        }
        $storage = $fields['label_storage'] ?? null;
        if (!in_array($storage, LabelSettings::STORAGES, true)) {
            $storage = $type?->storage;
        }

        return [
            'id' => $id,
            'builtin' => $builtin,
            'name' => $name,
            'blurb' => $blurb,
            'source' => $source,
            'fields' => $fields,
            'wrap_pictures' => $pictures,
            'size' => $size === null ? null : self::normaliseSize($size),
            'type_name' => $type?->name,
            'brand_name' => $brand,
            'footer_name' => $footer,
            'storage' => $storage,
        ];
    }
}
