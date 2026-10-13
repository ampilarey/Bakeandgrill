import { describe, expect, it } from 'vitest';
import type { CustomLabel, LabelProduct, LabelTemplate } from '../../api';
import { customDraft, itemDraft } from './labelDrafts';
import { applyToCustom, applyToItem, templateFromCustom, templateFromItem, templateLine, templateOfCustom, templateSize } from './labelTemplates';

/*
 * Templates (round 7, 2026-10-13): a label's settings without the product.
 * Made from a draft, applied to a draft; the name, pictures, barcode and
 * price are never carried; an item's ingredients stay its own.
 */
const WRAP = { parts: ['brand', 'legal', 'dates'] as ('brand' | 'legal' | 'dates')[], band: true, band_text: '', band_text_dv: '', marks: ['recycle'], pictures: [], text_heading: '', text_heading_dv: '', text: '', text_dv: '' };

const custom = (): CustomLabel => ({
  id: 3, kind: 'custom', name: 'Garlic Sauce', name_dv: 'ލޮނުމެދު', brand_id: 2, brand_name: 'Amma', brand_logo_url: null, label_type_id: 5, label_type_name: 'Chilled Hedhika',
  label_storage: 'chilled', storage: 'chilled', label_heading: 'HOMEMADE SAUCE', label_heading_dv: null, label_storage_line: null, label_storage_line_dv: null,
  label_ingredients: 'Garlic, oil', label_ingredients_dv: null, label_how_to_use: 'Stir', label_how_to_use_dv: null, label_note: 'No nuts', label_note_dv: null,
  footer_id: 1, footer_name: 'Standard', label_show_qr: false, label_lang: 'both', print_count: 0, last_printed_at: null,
  label_shelf_life_days: 14, label_pack_qty: 250, label_pack_unit: 'ML', label_price: 25, label_barcode: '590123412345', label_net_weight: '250 ml', label_allergens: 'garlic',
  label_nutrition: 'Energy 10 kcal', label_nutrition_per: 'ml', label_wrap: WRAP, wrap_pictures: [{ id: 9, url: '/m/9.png' }], label_layout: {}, label_badges: [],
  label_photo_media_id: 11, label_photo_url: '/m/11.png', label_title_media_id: null, label_title_url: null,
  defaults: { heading: '', heading_dv: '', storage_line: '', storage_line_dv: '', how_to_use: '', how_to_use_dv: '', note: '', note_dv: '', shelf_life_days: null, brand: 'Amma', unit: 'PCS' },
  ingredients: { en: 'Garlic, oil', dv: '', from: 'manual' }, created_by: null, updated_at: null,
});

const item = (): LabelProduct => ({
  id: 7, name: 'Bajiya', name_dv: null, label_enabled: true, label_ingredients_source: 'auto', label_ingredients: 'Flour, tuna', label_ingredients_dv: null,
  label_shelf_life_days: 90, label_storage: 'frozen', label_pack_qty: 10, label_heading: null, label_heading_dv: null, label_storage_line: null, label_storage_line_dv: null,
  label_note: null, label_note_dv: null, label_pack_unit: 'PCS', label_type_id: 4, label_type_name: 'Frozen Hedhika', label_how_to_use: 'Fry', label_how_to_use_dv: null,
  label_price: null, label_show_price: true, label_barcode: '12345670', label_net_weight: null, label_show_nutrition: false,
  nutrition: { complete: false, per100: {}, grams: 0, missing: [], unweighed: [], rows: [] }, label_nutrition_per: 'g', label_wrap: WRAP, wrap_pictures: [], label_layout: {}, label_badges: [],
  menu_price: 5, allergens: [], defaults: { heading: 'FROZEN HEDHIKA', heading_dv: '', storage_line: '', storage_line_dv: '', how_to_use: '', how_to_use_dv: '', note: '', note_dv: '', shelf_life_days: null, brand: 'Bake & Grill', unit: 'PCS' },
  label_title_media_id: null, label_title_url: null, label_photo_media_id: 12, label_photo_url: '/m/12.png', cutout_url: null, has_recipe: true,
  ingredients: { en: 'Flour, tuna', dv: '', from: 'recipe', recipe_en: 'Flour, tuna', recipe_dv: '' },
});

const template = (fields: LabelTemplate['fields'], extra: Partial<LabelTemplate> = {}): LabelTemplate => ({
  id: 'sauce-jar', builtin: true, name: 'Sauce or dip in a jar', blurb: null, source: null, fields, wrap_pictures: [], size: { shape: 'rect', preset: 'r60x40', on: 'sheet', w: 60, h: 40 },
  type_name: null, brand_name: null, footer_name: null, storage: 'chilled', created_by: null, created_at: null, ...extra,
});

describe('label templates', () => {
  it('takes everything but the product from a custom label, and leaves an item its ingredients', () => {
    const f = templateFromCustom(customDraft(custom()));
    expect(f).toMatchObject({ brand_id: 2, label_type_id: 5, label_storage: 'chilled', label_heading: 'HOMEMADE SAUCE', label_ingredients: 'Garlic, oil', footer_id: 1, label_show_qr: false, label_lang: 'both', label_shelf_life_days: 14, label_pack_qty: 250, label_pack_unit: 'ML', label_net_weight: '250 ml', label_allergens: 'garlic', label_nutrition: 'Energy 10 kcal', label_nutrition_per: 'ml' });
    expect(f.label_wrap?.parts).toEqual(['brand', 'legal', 'dates']);
    for (const key of ['name', 'name_dv', 'label_price', 'label_barcode', 'label_photo_media_id', 'label_title_media_id']) expect(f).not.toHaveProperty(key);

    const g = templateFromItem(itemDraft(item()));
    expect(g).toMatchObject({ label_type_id: 4, label_storage: 'frozen', label_shelf_life_days: 90, label_pack_qty: 10, label_pack_unit: 'PCS', label_how_to_use: 'Fry', label_show_price: true, label_show_nutrition: false });
    for (const key of ['label_ingredients', 'label_ingredients_dv', 'label_enabled', 'label_ingredients_source', 'label_barcode', 'label_photo_media_id']) expect(g).not.toHaveProperty(key);
  });

  it('fills a new custom label from a template and keeps its name, pictures, barcode and price', () => {
    const d = { ...customDraft(null), name: 'Chilli sauce', label_barcode: '111', label_price: '30', label_photo_media_id: 4, label_photo_url: '/m/4.png' };
    const t = template({ label_storage: 'chilled', label_heading: 'HOMEMADE SAUCE', label_how_to_use: 'Stir', label_shelf_life_days: 14, label_pack_unit: 'G', label_net_weight: '250 g', label_nutrition_per: 'ml', label_lang: 'en', label_show_qr: false, label_wrap: WRAP }, { wrap_pictures: [{ id: 9, url: '/m/9.png' }] });
    const n = applyToCustom(d, t);
    expect(n).toMatchObject({ name: 'Chilli sauce', label_barcode: '111', label_price: '30', label_photo_media_id: 4, label_storage: 'chilled', label_heading: 'HOMEMADE SAUCE', label_how_to_use: 'Stir', label_shelf_life_days: '14', label_pack_unit: 'G', label_net_weight: '250 g', label_nutrition_per: 'ml', label_lang: 'en', label_show_qr: 'off' });
    expect(n.label_wrap.parts).toEqual(['brand', 'legal', 'dates']);
    expect(n.wrap_pictures).toEqual([{ id: 9, url: '/m/9.png' }]);
    // A key the template leaves out leaves the box alone; one that is null blanks it.
    expect(n.label_note).toBe('');
    expect(applyToCustom({ ...d, label_note: 'Keep' }, template({ label_heading: 'X' })).label_note).toBe('Keep');
    expect(applyToCustom({ ...d, label_note: 'Keep' }, template({ label_note: null })).label_note).toBe('');
    expect(templateSize(t)).toEqual({ shape: 'rect', preset: 'r60x40', on: 'sheet', w: 60, h: 40 });
    expect(templateSize(template({}, { size: null }))).toBeNull();
  });

  it('fills a menu item from a template but never its ingredients, pictures, price, barcode or switch', () => {
    const d = itemDraft(item());
    const n = applyToItem(d, template({ label_type_id: 9, label_storage: 'chilled', label_heading: 'HOMEMADE', label_ingredients: 'Garlic', label_shelf_life_days: 14, label_pack_unit: 'G', label_show_price: false, label_show_nutrition: true, label_allergens: 'nuts' }));
    expect(n).toMatchObject({ label_type_id: 9, label_storage: 'chilled', label_heading: 'HOMEMADE', label_shelf_life_days: '14', label_pack_unit: 'G', label_show_price: false, label_show_nutrition: true });
    expect(n.label_ingredients).toBe('Flour, tuna');
    expect(n.label_ingredients_source).toBe('auto');
    expect(n.label_enabled).toBe(true);
    expect(n.label_barcode).toBe('12345670');
    expect(n.label_photo_media_id).toBe(12);
    // A template with no storage leaves the item's.
    expect(applyToItem(d, template({ label_storage: null })).label_storage).toBe('frozen');
  });

  it('stands an existing label in as a template and says what one carries', () => {
    const t = templateOfCustom(custom());
    expect(t).toMatchObject({ id: 'custom:3', name: 'Garlic Sauce', source: 'Garlic Sauce', storage: 'chilled', type_name: 'Chilled Hedhika', brand_name: 'Amma' });
    expect(t.fields.label_heading).toBe('HOMEMADE SAUCE');
    expect(t.fields).not.toHaveProperty('name');
    expect(templateLine(t)).toBe('Chilled · Chilled Hedhika · Amma · HOMEMADE SAUCE · keeps 14 days · ML · Standard strip');
    expect(templateLine(template({ label_shelf_life_days: 1, label_wrap: WRAP }))).toBe('Chilled · keeps 1 day · 60 × 40 mm');
    // The wrap parts are worth a word only on a wrap-around size.
    expect(templateLine(template({ label_wrap: WRAP }, { size: { shape: 'rect', preset: 'r180x40', on: 'sheet', w: 180, h: 40 } }))).toBe('Chilled · 180 × 40 mm · wrap in 3 parts');
    expect(templateLine(template({}, { storage: null, size: null }))).toBe('Nothing set yet');
  });
});
