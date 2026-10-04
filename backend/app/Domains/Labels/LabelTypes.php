<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\Item;
use App\Models\LabelBrand;
use App\Models\LabelType;

/**
 * The wording and brand a sticker prints with, resolved in order: what the
 * item carries itself, then the label type it was printed "as" (a whole
 * sheet can be), then the item's own type, then the v1 per-storage wording
 * for an item with no type at all. docs/LABEL_HUB_V2_PLAN.md decisions.
 */
final class LabelTypes
{
    /** @var array<int, array<string, mixed>> */
    private array $brands = [];

    /**
     * @return array<string, mixed> heading, heading_dv, storage, storage_en,
     *   storage_dv, use_within, use_within_dv, mfg_label, exp_label,
     *   how_to_use, how_to_use_dv, note, note_dv, show_qr, shelf_life_days,
     *   type_id, type_name, brand (array)
     */
    public function forItem(Item $item, ?LabelType $as = null): array
    {
        $type = $as ?? ($item->label_type_id ? $item->labelType : null);
        $storage = LabelSettings::storage((string) ($item->label_storage ?: $type?->storage ?: 'frozen'));
        $own = fn (string $col): string => trim((string) $item->{$col});
        $pick = fn (string $itemCol, ?string $typeVal, string $fallback = ''): string => $own($itemCol) !== '' ? $own($itemCol) : (trim((string) $typeVal) !== '' ? trim((string) $typeVal) : $fallback);
        // A type's storage line is for its own storage; an item kept differently takes the line for its storage.
        $lineFromType = $type && $type->storage === $storage;

        return [
            'type_id' => $type?->id,
            'type_name' => $type?->name,
            'heading' => $pick('label_heading', $type?->heading, LabelSettings::headingLine($storage, false)),
            'heading_dv' => $pick('label_heading_dv', $type?->heading_dv, LabelSettings::headingLine($storage, true)),
            'storage' => $storage,
            'storage_en' => $pick('label_storage_line', $lineFromType ? $type->storage_line : null, LabelSettings::storageLine($storage, false)),
            'storage_dv' => $pick('label_storage_line_dv', $lineFromType ? $type->storage_line_dv : null, LabelSettings::storageLine($storage, true)),
            'use_within' => trim((string) $type?->use_within),
            'use_within_dv' => trim((string) $type?->use_within_dv),
            'mfg_label' => trim((string) $type?->mfg_label) ?: 'MFG DATE',
            'exp_label' => trim((string) $type?->exp_label) ?: 'EXP DATE',
            'how_to_use' => $pick('label_how_to_use', $type?->how_to_use),
            'how_to_use_dv' => $pick('label_how_to_use_dv', $type?->how_to_use_dv),
            'note' => $pick('label_note', $type?->note),
            'note_dv' => $pick('label_note_dv', $type?->note_dv),
            'show_qr' => $type ? (bool) $type->show_qr : true,
            'shelf_life_days' => $item->label_shelf_life_days ?: $type?->shelf_life_days,
            'brand' => $this->brand($type?->brand_id ? $type->brand : null),
        ];
    }

    /**
     * A brand as the sticker draws it. The default brand is the business:
     * its name, tagline and logo come from Business Details and the brand
     * pack, so they stay in step with the receipts.
     *
     * @return array{id: ?int, name: string, name_dv: string, tagline: string, tagline_dv: string, logo: ?string, logo_ratio: float, is_default: bool, parent: string}
     */
    public function brand(?LabelBrand $brand): array
    {
        $brand ??= LabelBrand::default();
        $key = $brand?->id ?? 0;
        if (isset($this->brands[$key])) {
            return $this->brands[$key];
        }
        $contact = LabelSettings::contact();
        $isDefault = $brand === null || $brand->is_default;
        $logo = !$isDefault && $brand->logo_media_id ? LabelImage::fromMedia($brand->logo_media_id, 600) : null;
        // A brand with no uploaded logo uses one shipped in the brand pack
        // when there is one (public/brand/<name>-logo.png, e.g. Amma), else
        // the main logo.
        if ($logo === null && !$isDefault) {
            $logo = LabelImage::fromPublic('brand/' . self::slug($brand->name) . '-logo.png', 600);
        }
        $logo ??= LabelImage::fromPublic('brand/logo-light.png', 500);

        return $this->brands[$key] = [
            'id' => $brand?->id,
            'name' => $isDefault ? $contact['name'] : (string) $brand->name,
            'name_dv' => $isDefault ? LabelSettings::get('label_brand_line_dv') : (string) ($brand->name_dv ?: $brand->name),
            'tagline' => $isDefault ? $contact['tagline'] : (string) ($brand->tagline ?? ''),
            'tagline_dv' => $isDefault ? '' : (string) ($brand->tagline_dv ?? ''),
            'logo' => $logo,
            'logo_ratio' => LabelImage::ratio($logo),
            'is_default' => $isDefault,
            // A sub-brand's footer says who it is by.
            'parent' => $isDefault ? '' : $contact['name'],
        ];
    }

    private static function slug(string $name): string
    {
        return trim((string) preg_replace('/[^a-z0-9]+/', '-', mb_strtolower($name)), '-');
    }

    /** @return array<string, mixed> */
    public static function presentType(LabelType $type): array
    {
        return [
            'id' => $type->id,
            'brand_id' => $type->brand_id,
            'brand_name' => $type->brand?->name,
            'name' => $type->name,
            'heading' => $type->heading,
            'heading_dv' => $type->heading_dv,
            'storage' => $type->storage,
            'storage_line' => $type->storage_line,
            'storage_line_dv' => $type->storage_line_dv,
            'use_within' => $type->use_within,
            'use_within_dv' => $type->use_within_dv,
            'mfg_label' => $type->mfg_label,
            'exp_label' => $type->exp_label,
            'how_to_use' => $type->how_to_use,
            'how_to_use_dv' => $type->how_to_use_dv,
            'note' => $type->note,
            'note_dv' => $type->note_dv,
            'shelf_life_days' => $type->shelf_life_days,
            'show_qr' => (bool) $type->show_qr,
            'is_active' => (bool) $type->is_active,
            'sort' => $type->sort,
            'items_count' => $type->items_count ?? null,
            'defaults' => [
                'storage_line' => LabelSettings::storageLine($type->storage, false),
                'storage_line_dv' => LabelSettings::storageLine($type->storage, true),
            ],
        ];
    }

    /** @return array<string, mixed> */
    public static function presentBrand(LabelBrand $brand): array
    {
        $contact = LabelSettings::contact();

        return [
            'id' => $brand->id,
            'name' => $brand->name,
            'name_dv' => $brand->name_dv,
            'tagline' => $brand->is_default ? ($brand->tagline ?: $contact['tagline']) : $brand->tagline,
            'tagline_dv' => $brand->tagline_dv,
            'logo_media_id' => $brand->logo_media_id,
            'logo_url' => $brand->logo?->original_url ?? $brand->logo?->url ?? ($brand->is_default ? '/brand/logo-light.png' : (is_file(public_path('brand/' . self::slug($brand->name) . '-logo.png')) ? '/brand/' . self::slug($brand->name) . '-logo.png' : null)),
            'is_default' => (bool) $brand->is_default,
            'sort' => $brand->sort,
            'types_count' => $brand->types_count ?? null,
        ];
    }
}
