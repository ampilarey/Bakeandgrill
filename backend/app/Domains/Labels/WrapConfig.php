<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\CustomLabel;
use App\Models\Item;
use Illuminate\Validation\Rule;

/**
 * What a product's wrap-around label prints (owner, 2026-10-12: a bottle
 * label "with 2, 3, 4, 5 different parts"): which parts, in what order, the
 * flavour band along the bottom, the recycling marks and pictures, and a
 * free-text part. Kept as JSON on the item or custom label (`label_wrap`);
 * nothing kept prints the default set. WrapDesign draws it when the label is
 * wide and short enough for parts side by side (StickerLayouts::design).
 */
final class WrapConfig
{
    /** The parts a wrap label can hold, in the order they are offered. */
    public const PARTS = ['brand', 'legal', 'nutrition', 'dates', 'barcode', 'qr', 'marks', 'text', 'packed'];

    /** What each part is called in the Admin, and what it holds. */
    public const PART_WORDS = [
        'brand' => ['Brand and name', 'Logo, brand line, the product name (hand-lettered or typed) and its picture'],
        'legal' => ['Ingredients and legal text', 'Ingredients with allergens bold, "Contains …", storage, how to use, the note, and who made it'],
        'nutrition' => ['Nutrition per 100 g or ml', 'The values from the recipe, or a custom label\'s typed line'],
        'dates' => ['Dates and batch', 'Made-on and expiry boxes, batch and pack number, price, quantity and net weight (the barcode too, when there is no Barcode part and the room)'],
        'barcode' => ['Barcode', 'The EAN-13 or EAN-8 bars with the digits beneath; left out when the product has no barcode'],
        'qr' => ['QR code', 'The pack\'s page (batch QR) when it is on, else the complaints QR'],
        'marks' => ['Recycling marks and pictures', 'Recycling symbols, the tidy man, and any mark pictures picked from the library'],
        'text' => ['Free text', 'A heading and lines of your own, English and Dhivehi'],
        'packed' => ['Packed for and promotion', 'The packed-for box and the promotion flash, when the sheet carries them'],
    ];

    public const DEFAULT_PARTS = ['brand', 'legal', 'nutrition', 'dates', 'barcode', 'qr', 'marks'];

    public const DEFAULT_MARKS = ['recycle', 'dispose'];

    public const MAX_PICTURES = 4;

    /**
     * The effective config for a product: what is kept, filled in with the defaults.
     *
     * @return array{parts: list<string>, band: bool, band_text: string, band_text_dv: string, marks: list<string>, pictures: list<int>, text_heading: string, text_heading_dv: string, text: string, text_dv: string}
     */
    public static function of(Item|CustomLabel $product): array
    {
        $raw = $product->label_wrap;
        if (is_string($raw)) {
            $raw = json_decode($raw, true);
        }

        return self::clean(is_array($raw) ? $raw : null);
    }

    /**
     * A typed or kept config, tidied: known parts once each in the order
     * given (the order typed is the order printed; nothing moves the brand
     * part first), known marks, up to MAX_PICTURES picture ids, trimmed
     * text. Null gives the defaults.
     *
     * @param ?array<string, mixed> $in
     * @return array{parts: list<string>, band: bool, band_text: string, band_text_dv: string, marks: list<string>, pictures: list<int>, text_heading: string, text_heading_dv: string, text: string, text_dv: string}
     */
    public static function clean(?array $in): array
    {
        $parts = [];
        foreach ((array) ($in['parts'] ?? self::DEFAULT_PARTS) as $p) {
            if (in_array($p, self::PARTS, true) && !in_array($p, $parts, true)) {
                $parts[] = (string) $p;
            }
        }
        if ($parts === []) {
            $parts = self::DEFAULT_PARTS;
        }
        $marks = [];
        foreach ((array) ($in['marks'] ?? self::DEFAULT_MARKS) as $m) {
            if (isset(LabelMarks::MARKS[$m]) && !in_array($m, $marks, true)) {
                $marks[] = (string) $m;
            }
        }
        $pictures = [];
        foreach ((array) ($in['pictures'] ?? []) as $id) {
            if (is_numeric($id) && (int) $id > 0 && !in_array((int) $id, $pictures, true) && count($pictures) < self::MAX_PICTURES) {
                $pictures[] = (int) $id;
            }
        }
        $text = fn (string $key, int $max): string => mb_substr(trim((string) ($in[$key] ?? '')), 0, $max);

        return [
            'parts' => $parts,
            'band' => $in === null || !array_key_exists('band', $in) ? true : filter_var($in['band'], FILTER_VALIDATE_BOOL),
            'band_text' => $text('band_text', 60),
            'band_text_dv' => $text('band_text_dv', 60),
            'marks' => $marks,
            'pictures' => $pictures,
            'text_heading' => $text('text_heading', 40),
            'text_heading_dv' => $text('text_heading_dv', 40),
            'text' => $text('text', 400),
            'text_dv' => $text('text_dv', 400),
        ];
    }

    /**
     * The validation of a typed config under `$key` (a label's `label_wrap`,
     * a template's `fields.label_wrap`).
     *
     * @return array<string, mixed>
     */
    public static function rules(string $key = 'label_wrap'): array
    {
        return [
            $key => 'sometimes|nullable|array',
            "$key.parts" => 'sometimes|array|max:' . count(self::PARTS),
            "$key.parts.*" => ['string', Rule::in(self::PARTS)],
            "$key.band" => 'sometimes|boolean',
            "$key.band_text" => 'sometimes|nullable|string|max:60',
            "$key.band_text_dv" => 'sometimes|nullable|string|max:60',
            "$key.marks" => 'sometimes|array|max:' . count(LabelMarks::KEYS),
            "$key.marks.*" => ['string', Rule::in(LabelMarks::KEYS)],
            "$key.pictures" => 'sometimes|array|max:' . self::MAX_PICTURES,
            "$key.pictures.*" => 'integer|exists:media_assets,id',
            "$key.text_heading" => 'sometimes|nullable|string|max:40',
            "$key.text_heading_dv" => 'sometimes|nullable|string|max:40',
            "$key.text" => 'sometimes|nullable|string|max:400',
            "$key.text_dv" => 'sometimes|nullable|string|max:400',
        ];
    }

    /**
     * The parts and marks as the Admin lists them.
     *
     * @return array{parts: list<array{key: string, label: string, hint: string}>, marks: list<array{key: string, label: string, caption: string}>, default_parts: list<string>, default_marks: list<string>, max_pictures: int}
     */
    public static function catalogue(): array
    {
        $parts = [];
        foreach (self::PART_WORDS as $key => [$label, $hint]) {
            $parts[] = ['key' => $key, 'label' => $label, 'hint' => $hint];
        }

        return ['parts' => $parts, 'marks' => LabelMarks::catalogue(), 'default_parts' => self::DEFAULT_PARTS, 'default_marks' => self::DEFAULT_MARKS, 'max_pictures' => self::MAX_PICTURES];
    }
}
