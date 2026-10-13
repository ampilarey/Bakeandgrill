import type { CustomLabel, LabelProduct, LabelStorage, LabelTemplate, LabelTemplateFields } from '../../api';
import { customDraft, customPayload, itemDraft, itemPayload, type CustomDraft, type ItemDraft } from './labelDrafts';
import { designFor, sizeName, type SizeChoice } from './labelSize';

/*
 * Label templates (round 7 of the usability work, owner, 2026-10-13: "Start
 * from a saved label or a built-in template, and Save as template from any
 * label, so a new sauce takes thirty seconds").
 *
 * A template is a label's settings without the product: the brand, type,
 * storage, wording, shelf life, pack unit, bottom strip, language, wrap parts
 * and the size it printed at. Never the name, the pictures, the barcode or
 * the price. One is made from a draft (templateFromCustom, templateFromItem),
 * or stands in for an existing label (templateOfCustom, templateOfItem, so
 * "copy another label" is the same thing as a template), and is applied to a
 * draft (applyToCustom, applyToItem): a key the template holds fills the box,
 * a key it leaves out leaves the box alone.
 */

export const TEMPLATE_KEYS = [
  'brand_id', 'label_type_id', 'label_storage',
  'label_heading', 'label_heading_dv', 'label_storage_line', 'label_storage_line_dv',
  'label_ingredients', 'label_ingredients_dv', 'label_how_to_use', 'label_how_to_use_dv', 'label_note', 'label_note_dv',
  'footer_id', 'label_show_qr', 'label_lang',
  'label_shelf_life_days', 'label_pack_qty', 'label_pack_unit', 'label_net_weight', 'label_allergens',
  'label_nutrition', 'label_nutrition_per', 'label_wrap', 'label_show_price', 'label_show_nutrition', 'label_layout', 'label_badges',
] as const;
type Key = (typeof TEMPLATE_KEYS)[number];

const TEXT_KEYS = [
  'label_heading', 'label_heading_dv', 'label_storage_line', 'label_storage_line_dv',
  'label_ingredients', 'label_ingredients_dv', 'label_how_to_use', 'label_how_to_use_dv', 'label_note', 'label_note_dv',
  'label_pack_unit', 'label_net_weight', 'label_allergens', 'label_nutrition',
] as const;

function pick(src: Record<string, unknown>, skip: Key[] = []): LabelTemplateFields {
  const out: Record<string, unknown> = {};
  for (const k of TEMPLATE_KEYS) {
    if (k in src && !skip.includes(k)) out[k] = src[k];
  }
  return out as LabelTemplateFields;
}

/** What a custom label's draft gives a template: everything but the product itself. */
export const templateFromCustom = (d: CustomDraft): LabelTemplateFields => pick(customPayload(d) as unknown as Record<string, unknown>);

/** What a menu item's draft gives a template: its ingredients are its own (its recipe, usually), so they stay out. */
export const templateFromItem = (d: ItemDraft): LabelTemplateFields => pick(itemPayload(d) as unknown as Record<string, unknown>, ['label_ingredients', 'label_ingredients_dv']);

/** An existing custom label as a template, to copy from. */
export function templateOfCustom(c: CustomLabel): LabelTemplate {
  return {
    id: `custom:${c.id}`, builtin: false, name: c.name, blurb: null, source: c.name,
    fields: templateFromCustom(customDraft(c)), wrap_pictures: c.wrap_pictures ?? [], size: null,
    type_name: c.label_type_name, brand_name: c.brand_name, footer_name: c.footer_name, storage: c.storage,
    created_by: null, created_at: null,
  };
}

/** A menu item's label as a template, to copy from. */
export function templateOfItem(p: LabelProduct): LabelTemplate {
  return {
    id: `item:${p.id}`, builtin: false, name: p.name, blurb: null, source: p.name,
    fields: templateFromItem(itemDraft(p)), wrap_pictures: p.wrap_pictures ?? [], size: null,
    type_name: p.label_type_name, brand_name: p.defaults.brand, footer_name: null, storage: p.label_storage,
    created_by: null, created_at: null,
  };
}

const str = (v: unknown): string => (v == null ? '' : String(v));
const num = (v: unknown): string => (typeof v === 'number' && v > 0 ? String(v) : '');

/** A new custom label's draft filled from a template: the name, pictures, barcode and price stay as they are. */
export function applyToCustom(d: CustomDraft, t: LabelTemplate): CustomDraft {
  const f = t.fields;
  const has = (k: Key) => k in f;
  const n: CustomDraft = { ...d };
  if (has('brand_id')) n.brand_id = f.brand_id ?? null;
  if (has('label_type_id')) n.label_type_id = f.label_type_id ?? null;
  if (has('label_storage')) n.label_storage = f.label_storage ?? '';
  for (const k of TEXT_KEYS) {
    if (has(k)) n[k] = str(f[k]);
  }
  if (has('footer_id')) n.footer_id = f.footer_id ?? null;
  if (has('label_show_qr')) n.label_show_qr = f.label_show_qr == null ? '' : f.label_show_qr ? 'on' : 'off';
  if (has('label_lang')) n.label_lang = f.label_lang ?? '';
  if (has('label_shelf_life_days')) n.label_shelf_life_days = num(f.label_shelf_life_days);
  if (has('label_pack_qty')) n.label_pack_qty = num(f.label_pack_qty);
  if (has('label_nutrition_per')) n.label_nutrition_per = f.label_nutrition_per === 'ml' ? 'ml' : 'g';
  if (has('label_wrap') && f.label_wrap) {
    n.label_wrap = f.label_wrap;
    n.wrap_pictures = t.wrap_pictures ?? [];
  }
  if (has('label_layout')) n.label_layout = f.label_layout ?? {};
  if (has('label_badges')) n.label_badges = f.label_badges ? [...f.label_badges] : [];
  return n;
}

/**
 * A menu item's draft filled from a template: the type, storage, wording,
 * shelf life, pack settings, price and nutrition switches and the wrap parts.
 * Its ingredients (the recipe's), pictures, price, barcode and on/off stay.
 */
export function applyToItem(d: ItemDraft, t: LabelTemplate): ItemDraft {
  const f = t.fields;
  const has = (k: Key) => k in f;
  const n: ItemDraft = { ...d };
  if (has('label_type_id')) n.label_type_id = f.label_type_id ?? null;
  if (has('label_storage') && f.label_storage) n.label_storage = f.label_storage;
  for (const k of TEXT_KEYS) {
    if (k === 'label_ingredients' || k === 'label_ingredients_dv' || k === 'label_allergens' || k === 'label_nutrition') continue;
    if (has(k)) n[k] = str(f[k]);
  }
  if (has('label_shelf_life_days')) n.label_shelf_life_days = num(f.label_shelf_life_days);
  if (has('label_pack_qty')) n.label_pack_qty = num(f.label_pack_qty);
  if (has('label_nutrition_per')) n.label_nutrition_per = f.label_nutrition_per === 'ml' ? 'ml' : 'g';
  if (has('label_show_price') && typeof f.label_show_price === 'boolean') n.label_show_price = f.label_show_price;
  if (has('label_show_nutrition') && typeof f.label_show_nutrition === 'boolean') n.label_show_nutrition = f.label_show_nutrition;
  if (has('label_wrap') && f.label_wrap) {
    n.label_wrap = f.label_wrap;
    n.wrap_pictures = t.wrap_pictures ?? [];
  }
  if (has('label_layout')) n.label_layout = f.label_layout ?? {};
  if (has('label_badges')) n.label_badges = f.label_badges ? [...f.label_badges] : [];
  return n;
}

/** The size a template printed at, as a size choice; null when it keeps none. */
export function templateSize(t: LabelTemplate): SizeChoice | null {
  return t.size ? { shape: t.size.shape, preset: t.size.preset, on: t.size.on, w: t.size.w, h: t.size.h } : null;
}

/** A size choice as a template keeps it. */
export function sizeForTemplate(c: SizeChoice | null): LabelTemplate['size'] {
  return c ? { shape: c.shape, preset: c.preset, on: c.on, w: c.w, h: c.h } : null;
}

const STORAGE_WORDS: Record<LabelStorage, string> = { frozen: 'Frozen', chilled: 'Chilled', ambient: 'Room temperature' };

/** One line saying what a template carries: "Chilled · Chilled Hedhika · Amma · keeps 14 days · 60 × 40 mm". */
export function templateLine(t: LabelTemplate): string {
  const f = t.fields;
  const parts: string[] = [];
  if (t.storage) parts.push(STORAGE_WORDS[t.storage]);
  if (t.type_name) parts.push(t.type_name);
  if (t.brand_name) parts.push(t.brand_name);
  if (f.label_heading) parts.push(f.label_heading);
  if (f.label_shelf_life_days) parts.push(`keeps ${f.label_shelf_life_days} ${f.label_shelf_life_days === 1 ? 'day' : 'days'}`);
  if (f.label_pack_unit) parts.push(f.label_pack_unit);
  if (t.footer_name) parts.push(`${t.footer_name} strip`);
  // Every label keeps wrap parts; they only matter on a wrap-around size.
  if (t.size) {
    parts.push(sizeName(t.size.shape, t.size.w, t.size.h));
    if (f.label_wrap && designFor(t.size.shape, t.size.w, t.size.h) === 'wrap') parts.push(`wrap in ${f.label_wrap.parts.length} parts`);
  }
  return parts.join(' · ') || 'Nothing set yet';
}
