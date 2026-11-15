<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\CustomLabel;

/**
 * A tub's two labels, made in one go (owner, 2026-11-16: "on the top of the
 * container circular label with name and photo. At the side rectangular label
 * with other details"): "Frozen Jhol Momo (Lid)", a round label that draws
 * StickerDesign::lid (brand, photo, name, what the pack holds), and "Frozen Jhol
 * Momo (Side)", an ordinary rectangular label with the ingredients, the dates
 * and the rest. Both print the product's name without the bracket.
 */
final class TubSet
{
    /** The parts of a tub a label can be for, and the word in its name. */
    public const PARTS = ['lid' => 'Lid', 'side' => 'Side'];

    public const DEFAULT_LID = 'c80';

    public const DEFAULT_SIDE = 'r100x50';

    /** What both labels take from a built-in template or the form. */
    private const FIELDS = [
        'label_storage', 'label_heading', 'label_heading_dv', 'label_storage_line', 'label_storage_line_dv',
        'label_ingredients', 'label_ingredients_dv', 'label_how_to_use', 'label_how_to_use_dv', 'label_note', 'label_note_dv',
        'label_lang', 'label_shelf_life_days', 'label_pack_qty', 'label_pack_unit', 'label_net_weight', 'label_allergens', 'label_price',
    ];

    /** A custom label's part, or null for an ordinary label. */
    public static function partOf(mixed $item): ?string
    {
        $part = $item instanceof CustomLabel ? (string) $item->label_part : '';

        return isset(self::PARTS[$part]) ? $part : null;
    }

    /** "Frozen Jhol Momo (Lid)" prints as "Frozen Jhol Momo". */
    public static function printName(string $name, ?string $part): string
    {
        return $part !== null && isset(self::PARTS[$part]) ? PouchSet::printName($name, self::PARTS[$part]) : $name;
    }

    /**
     * The built-in templates a set can start from: ordinary stickers, not pouches or wrap-around labels.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function templates(): array
    {
        $out = [];
        foreach (LabelTemplates::BUILTIN as $t) {
            if (!isset($t['fields']['label_pouch']) && !isset($t['fields']['label_wrap']) && !empty($t['product'])) {
                $out[$t['id']] = $t;
            }
        }

        return $out;
    }

    /**
     * What the Admin's form starts with.
     *
     * @return array{lid: string, side: string, templates: list<array{id: string, name: string, product: string, has_photo: bool, photo_url: ?string, fields: array<string, mixed>}>}
     */
    public static function catalogue(): array
    {
        $templates = [];
        foreach (self::templates() as $t) {
            $templates[] = ['id' => $t['id'], 'name' => $t['name'], 'product' => (string) $t['product'], 'has_photo' => !empty($t['photo']), 'photo_url' => !empty($t['photo']) ? '/' . $t['photo'] : null, 'fields' => array_intersect_key($t['fields'], array_flip(self::FIELDS))];
        }

        return ['lid' => self::DEFAULT_LID, 'side' => self::DEFAULT_SIDE, 'templates' => $templates];
    }

    /**
     * The lid label and the side label.
     *
     * @param array<string, mixed> $in name, name_dv, template, photo_media_id, lid and side (preset ids), and any of FIELDS
     * @return list<array{label: CustomLabel, preset: string}>
     */
    public static function create(array $in, ?int $userId): array
    {
        $template = self::templates()[$in['template'] ?? ''] ?? null;
        $fields = array_intersect_key($in, array_flip(self::FIELDS)) + array_intersect_key($template['fields'] ?? [], array_flip(self::FIELDS));
        $fields = array_filter($fields, fn ($v) => $v !== null && $v !== '');
        $name = trim((string) $in['name']);
        $out = [];
        foreach (['lid' => (string) ($in['lid'] ?? self::DEFAULT_LID), 'side' => (string) ($in['side'] ?? self::DEFAULT_SIDE)] as $part => $preset) {
            $label = CustomLabel::query()->create($fields + [
                'name' => mb_substr($name . ' (' . self::PARTS[$part] . ')', 0, 80),
                'name_dv' => ($in['name_dv'] ?? null) ?: null,
                'label_part' => $part,
                'label_size' => StickerLayouts::sizeOfPreset($preset),
                'label_photo_media_id' => $in['photo_media_id'] ?? null,
                'created_by' => $userId,
            ]);
            $out[] = ['label' => $label, 'preset' => $preset];
        }

        return $out;
    }
}
