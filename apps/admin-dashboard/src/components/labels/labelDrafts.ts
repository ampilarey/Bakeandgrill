import type { CustomLabel, CustomLabelPayload, IngredientsSource, LabelArrangement, LabelProduct, LabelStorage, LabelWrap, NutritionPer, StickerLang, WrapPicture, updateItemLabel } from '../../api';
import { EMPTY_WRAP } from './WrapParts';

/*
 * A label's settings as a form holds them (strings in the boxes, ids in the
 * selects), and the way back to what the server takes. The custom label
 * editor, the item's Label tab and the Make a label wizard's tap-to-edit
 * sheets (round 3, 2026-10-13) all edit the same drafts, so a change made
 * from a tap on the preview is the same change the long form makes.
 */

export type CustomDraft = {
  name: string; name_dv: string; brand_id: number | null; label_type_id: number | null; label_storage: LabelStorage | '';
  label_heading: string; label_heading_dv: string; label_storage_line: string; label_storage_line_dv: string;
  label_ingredients: string; label_ingredients_dv: string; label_how_to_use: string; label_how_to_use_dv: string;
  label_note: string; label_note_dv: string; footer_id: number | null;
  label_show_qr: '' | 'on' | 'off'; label_lang: StickerLang | '';
  label_shelf_life_days: string; label_pack_qty: string; label_pack_unit: string;
  label_price: string; label_barcode: string; label_net_weight: string; label_allergens: string; label_nutrition: string;
  label_nutrition_per: NutritionPer; label_wrap: LabelWrap; wrap_pictures: WrapPicture[];
  /** The parts moved or resized by hand, per design (round 8). */
  label_layout: LabelArrangement;
  /** Badges (round 9): up to four keys. */
  label_badges: string[];
  label_photo_media_id: number | null; label_photo_url: string | null; label_title_media_id: number | null; label_title_url: string | null;
};

export const customDraft = (c: CustomLabel | null): CustomDraft => ({
  name: c?.name ?? '', name_dv: c?.name_dv ?? '', brand_id: c?.brand_id ?? null, label_type_id: c?.label_type_id ?? null, label_storage: c?.label_storage ?? '',
  label_heading: c?.label_heading ?? '', label_heading_dv: c?.label_heading_dv ?? '', label_storage_line: c?.label_storage_line ?? '', label_storage_line_dv: c?.label_storage_line_dv ?? '',
  label_ingredients: c?.label_ingredients ?? '', label_ingredients_dv: c?.label_ingredients_dv ?? '', label_how_to_use: c?.label_how_to_use ?? '', label_how_to_use_dv: c?.label_how_to_use_dv ?? '',
  label_note: c?.label_note ?? '', label_note_dv: c?.label_note_dv ?? '', footer_id: c?.footer_id ?? null,
  label_show_qr: c?.label_show_qr == null ? '' : c.label_show_qr ? 'on' : 'off', label_lang: c?.label_lang ?? '',
  label_shelf_life_days: c?.label_shelf_life_days ? String(c.label_shelf_life_days) : '', label_pack_qty: c?.label_pack_qty ? String(c.label_pack_qty) : '', label_pack_unit: c?.label_pack_unit ?? '',
  label_price: c?.label_price != null ? String(c.label_price) : '', label_barcode: c?.label_barcode ?? '', label_net_weight: c?.label_net_weight ?? '', label_allergens: c?.label_allergens ?? '',
  label_nutrition: c?.label_nutrition ?? '',
  label_nutrition_per: c?.label_nutrition_per === 'ml' ? 'ml' : 'g', label_wrap: c?.label_wrap ?? EMPTY_WRAP, wrap_pictures: c?.wrap_pictures ?? [],
  label_layout: c?.label_layout ?? {},
  label_badges: c?.label_badges ?? [],
  label_photo_media_id: c?.label_photo_media_id ?? null, label_photo_url: c?.label_photo_url ?? null, label_title_media_id: c?.label_title_media_id ?? null, label_title_url: c?.label_title_url ?? null,
});

const text = (v: string) => v.trim() || null;

export const customPayload = (d: CustomDraft): CustomLabelPayload => ({
  name: d.name.trim(), name_dv: text(d.name_dv), brand_id: d.brand_id, label_type_id: d.label_type_id, label_storage: d.label_storage || null,
  label_heading: text(d.label_heading), label_heading_dv: text(d.label_heading_dv), label_storage_line: text(d.label_storage_line), label_storage_line_dv: text(d.label_storage_line_dv),
  label_ingredients: text(d.label_ingredients), label_ingredients_dv: text(d.label_ingredients_dv), label_how_to_use: text(d.label_how_to_use), label_how_to_use_dv: text(d.label_how_to_use_dv),
  label_note: text(d.label_note), label_note_dv: text(d.label_note_dv), footer_id: d.footer_id,
  label_show_qr: d.label_show_qr === '' ? null : d.label_show_qr === 'on', label_lang: d.label_lang || null,
  label_shelf_life_days: d.label_shelf_life_days ? Number(d.label_shelf_life_days) : null, label_pack_qty: d.label_pack_qty ? Number(d.label_pack_qty) : null, label_pack_unit: text(d.label_pack_unit),
  label_price: d.label_price !== '' ? Number(d.label_price) : null, label_barcode: text(d.label_barcode), label_net_weight: text(d.label_net_weight), label_allergens: text(d.label_allergens),
  label_nutrition: text(d.label_nutrition),
  label_nutrition_per: d.label_nutrition_per, label_wrap: d.label_wrap, label_layout: d.label_layout, label_badges: d.label_badges,
  label_photo_media_id: d.label_photo_media_id, label_title_media_id: d.label_title_media_id,
});

export type ItemDraft = {
  label_enabled: boolean;
  label_ingredients_source: IngredientsSource;
  label_ingredients: string;
  label_ingredients_dv: string;
  label_shelf_life_days: string;
  label_storage: LabelStorage;
  label_pack_qty: string;
  label_heading: string;
  label_heading_dv: string;
  label_storage_line: string;
  label_storage_line_dv: string;
  label_note: string;
  label_note_dv: string;
  label_pack_unit: string;
  label_type_id: number | null;
  label_how_to_use: string;
  label_how_to_use_dv: string;
  label_title_media_id: number | null;
  label_title_url: string | null;
  label_photo_media_id: number | null;
  label_photo_url: string | null;
  label_price: string;
  label_show_price: boolean;
  label_barcode: string;
  label_net_weight: string;
  label_show_nutrition: boolean;
  label_nutrition_per: NutritionPer;
  /** Round 15: the serving size, typed. */
  label_serving_g: string;
  /** The wrap-around label's parts (2026-10-12), and the picked mark pictures with their urls. */
  label_wrap: LabelWrap;
  wrap_pictures: WrapPicture[];
  /** The parts moved or resized by hand, per design (round 8). */
  label_layout: LabelArrangement;
  /** Badges (round 9): up to four keys. */
  label_badges: string[];
};

export const itemDraft = (p: LabelProduct): ItemDraft => ({
  label_enabled: p.label_enabled,
  label_ingredients_source: p.label_ingredients_source,
  label_ingredients: p.label_ingredients ?? '',
  label_ingredients_dv: p.label_ingredients_dv ?? '',
  label_shelf_life_days: p.label_shelf_life_days ? String(p.label_shelf_life_days) : '',
  label_storage: p.label_storage,
  label_pack_qty: p.label_pack_qty ? String(p.label_pack_qty) : '',
  label_heading: p.label_heading ?? '',
  label_heading_dv: p.label_heading_dv ?? '',
  label_storage_line: p.label_storage_line ?? '',
  label_storage_line_dv: p.label_storage_line_dv ?? '',
  label_note: p.label_note ?? '',
  label_note_dv: p.label_note_dv ?? '',
  label_pack_unit: p.label_pack_unit ?? '',
  label_type_id: p.label_type_id,
  label_how_to_use: p.label_how_to_use ?? '',
  label_how_to_use_dv: p.label_how_to_use_dv ?? '',
  label_title_media_id: p.label_title_media_id,
  label_title_url: p.label_title_url,
  label_photo_media_id: p.label_photo_media_id,
  label_photo_url: p.label_photo_url,
  label_price: p.label_price != null ? String(p.label_price) : '',
  label_show_price: p.label_show_price,
  label_barcode: p.label_barcode ?? '',
  label_net_weight: p.label_net_weight ?? '',
  label_show_nutrition: p.label_show_nutrition,
  label_nutrition_per: p.label_nutrition_per === 'ml' ? 'ml' : 'g',
  label_serving_g: p.label_serving_g ? String(p.label_serving_g) : '',
  label_wrap: p.label_wrap,
  wrap_pictures: p.wrap_pictures ?? [],
  label_layout: p.label_layout ?? {},
  label_badges: p.label_badges ?? [],
});

export type ItemLabelPayload = Parameters<typeof updateItemLabel>[1];

export const itemPayload = (d: ItemDraft): ItemLabelPayload => ({
  label_enabled: d.label_enabled,
  label_ingredients_source: d.label_ingredients_source,
  label_ingredients: d.label_ingredients || null,
  label_ingredients_dv: d.label_ingredients_dv || null,
  label_shelf_life_days: d.label_shelf_life_days ? Number(d.label_shelf_life_days) : null,
  label_storage: d.label_storage,
  label_pack_qty: d.label_pack_qty ? Number(d.label_pack_qty) : null,
  label_heading: d.label_heading.trim() || null,
  label_heading_dv: d.label_heading_dv.trim() || null,
  label_storage_line: d.label_storage_line.trim() || null,
  label_storage_line_dv: d.label_storage_line_dv.trim() || null,
  label_note: d.label_note.trim() || null,
  label_note_dv: d.label_note_dv.trim() || null,
  label_pack_unit: d.label_pack_unit.trim() || null,
  label_type_id: d.label_type_id,
  label_how_to_use: d.label_how_to_use.trim() || null,
  label_how_to_use_dv: d.label_how_to_use_dv.trim() || null,
  label_title_media_id: d.label_title_media_id,
  label_photo_media_id: d.label_photo_media_id,
  label_price: d.label_price !== '' ? Number(d.label_price) : null,
  label_show_price: d.label_show_price,
  label_barcode: d.label_barcode.trim() || null,
  label_net_weight: d.label_net_weight.trim() || null,
  label_show_nutrition: d.label_show_nutrition,
  label_nutrition_per: d.label_nutrition_per,
  label_serving_g: d.label_serving_g !== '' && Number(d.label_serving_g) > 0 ? Number(d.label_serving_g) : null,
  label_wrap: d.label_wrap,
  label_layout: d.label_layout,
  label_badges: d.label_badges,
});

/** The part of a payload a tap-to-edit sheet changed: only those keys go to the server. */
export function pickKeys<T extends object>(payload: T, keys: string[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) {
    if (k in payload) out[k as keyof T] = payload[k as keyof T];
  }
  return out;
}

/** What the nutrition switch says the recipe gives today (round C). */
export function nutritionWords(n: LabelProduct['nutrition']): string {
  if (n.rows.length === 0) return 'Needs a recipe: the panel is worked out from the recipe\'s ingredients and their values per 100 g (Labels → Settings → Nutrition).';
  if (n.complete) {
    const v = n.per100;
    return `From the recipe (${n.grams} g): ${v.kcal ?? 0} kcal, fat ${v.fat ?? 0} g, carbs ${v.carbs ?? 0} g, protein ${v.protein ?? 0} g, salt ${v.salt ?? 0} g per 100 g. Prints on the full-size sticker.`;
  }
  const parts: string[] = [];
  if (n.missing.length) parts.push(`Waiting for values per 100 g for ${n.missing.join(', ')} (Labels → Settings → Nutrition).`);
  if (n.unweighed.length) parts.push(`${n.unweighed.join(', ')} ${n.unweighed.length === 1 ? 'is' : 'are'} not measured in grams in the recipe, so the panel cannot be worked out.`);
  return parts.join(' ');
}
