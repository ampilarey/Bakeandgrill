import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LabelProduct } from '../../api';

/*
 * A menu item's Label tab with Start from and Save as template (round 7,
 * 2026-10-13): a template fills the wording and settings but never the
 * item's ingredients or pictures; the item's settings are kept as a
 * template without its ingredients.
 */
const api = vi.hoisted(() => ({
  fetchLabelItem: vi.fn(), fetchLabelLayouts: vi.fn(), fetchLabelTypes: vi.fn(), stickerLinks: vi.fn(), updateItemLabel: vi.fn(),
  fetchLabelTemplates: vi.fn(), fetchCustomLabels: vi.fn(), fetchLabelProducts: vi.fn(), createLabelTemplate: vi.fn(),
}));
vi.mock('../../api', () => api);
vi.mock('../MediaPicker', () => ({ MediaPicker: () => null }));
vi.mock('../ui', async () => {
  const actual = await vi.importActual<typeof import('../ui')>('../ui');
  return { ...actual, useToast: () => ({ toast: vi.fn() }) };
});

import { ItemLabelTab } from './ItemLabelTab';

const WRAP = { parts: ['brand', 'legal'] as ('brand' | 'legal')[], band: true, band_text: '', band_text_dv: '', marks: [], pictures: [], text_heading: '', text_heading_dv: '', text: '', text_dv: '' };
const product = (): LabelProduct => ({
  id: 7, name: 'Bajiya', name_dv: null, label_enabled: true, label_ingredients_source: 'auto', label_ingredients: null, label_ingredients_dv: null,
  label_shelf_life_days: 90, label_storage: 'frozen', label_pack_qty: 10, label_heading: null, label_heading_dv: null, label_storage_line: null, label_storage_line_dv: null,
  label_note: null, label_note_dv: null, label_pack_unit: 'PCS', label_type_id: null, label_type_name: null, label_how_to_use: null, label_how_to_use_dv: null,
  label_price: null, label_show_price: false, label_barcode: '12345670', label_net_weight: null, label_show_nutrition: false,
  nutrition: { complete: false, per100: {}, grams: 0, missing: [], unweighed: [], rows: [] }, label_nutrition_per: 'g', label_wrap: WRAP, wrap_pictures: [], label_layout: {},
  menu_price: 5, allergens: [], defaults: { heading: 'FROZEN HEDHIKA', heading_dv: '', storage_line: '', storage_line_dv: '', how_to_use: '', how_to_use_dv: '', note: '', note_dv: '', shelf_life_days: null, brand: 'Bake & Grill', unit: 'PCS' },
  label_title_media_id: null, label_title_url: null, label_photo_media_id: 12, label_photo_url: '/m/12.png', cutout_url: null, has_recipe: true,
  ingredients: { en: 'Flour, tuna', dv: '', from: 'recipe', recipe_en: 'Flour, tuna', recipe_dv: '' },
});
const TEMPLATE = {
  id: 'sauce-jar', builtin: true, name: 'Sauce or dip in a jar', blurb: null, source: null,
  fields: { label_storage: 'chilled', label_heading: 'HOMEMADE SAUCE', label_ingredients: 'Garlic, oil', label_shelf_life_days: 14, label_pack_unit: 'G', label_show_price: true },
  wrap_pictures: [], size: { shape: 'rect', preset: 'r60x40', on: 'sheet', w: 60, h: 40 }, type_name: null, brand_name: null, footer_name: null, storage: 'chilled', created_by: null, created_at: null,
};

describe('ItemLabelTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchLabelItem.mockResolvedValue({ data: product() });
    api.fetchLabelLayouts.mockResolvedValue({ data: [], presets: [], wrap: null });
    api.fetchLabelTypes.mockResolvedValue({ data: [] });
    api.stickerLinks.mockResolvedValue({ url: '/labels/stickers?signature=x', one_url: '/labels/stickers?one=1&signature=x', summary: { design: 'full', spots: [] } });
    api.updateItemLabel.mockImplementation(async (_id: number, body: Record<string, unknown>) => ({ data: { ...product(), ...body } }));
    api.fetchLabelTemplates.mockResolvedValue({ data: [], builtin: [TEMPLATE] });
    api.fetchCustomLabels.mockResolvedValue({ data: [] });
    api.fetchLabelProducts.mockResolvedValue({ data: [product(), { ...product(), id: 8, name: 'Masroshi' }] });
    api.createLabelTemplate.mockResolvedValue({ data: { ...TEMPLATE, id: 5, builtin: false, name: 'Bajiya template' } });
  });

  it('starts from a template, keeping the ingredients and pictures, and saves the item\'s settings as a template without them', async () => {
    render(<ItemLabelTab itemId={7} />);
    const select = await screen.findByLabelText('Start from');
    await waitFor(() => expect(select).not.toBeDisabled());
    // The item itself is not offered to copy from; the other item is.
    expect(select).not.toHaveTextContent('Bajiya');
    expect(select).toHaveTextContent('Masroshi');
    fireEvent.change(select, { target: { value: 'sauce-jar' } });
    expect(screen.getByLabelText('Heading (top of the sticker)')).toHaveValue('HOMEMADE SAUCE');
    expect(screen.getByLabelText('Storage')).toHaveValue('chilled');
    expect(screen.getByLabelText('Shelf life (days)')).toHaveValue(14);
    expect(screen.getByLabelText('Unit after the quantity')).toHaveValue('G');
    expect(screen.getByLabelText('Typed ingredients (English)')).toHaveValue('');
    expect(screen.getByLabelText('Barcode (EAN-13 or EAN-8)')).toHaveValue('12345670');
    expect(screen.getByTestId('start-from-hint')).toHaveTextContent('Started from Sauce or dip in a jar.');

    fireEvent.click(screen.getByRole('button', { name: 'Save label settings' }));
    await waitFor(() => expect(api.updateItemLabel).toHaveBeenCalledTimes(1));
    expect(api.updateItemLabel.mock.calls[0][1]).toMatchObject({ label_storage: 'chilled', label_heading: 'HOMEMADE SAUCE', label_shelf_life_days: 14, label_pack_unit: 'G', label_show_price: true, label_ingredients: null, label_barcode: '12345670', label_photo_media_id: 12 });

    fireEvent.click(screen.getByTestId('save-as-template'));
    expect(screen.getByLabelText('Template name')).toHaveValue('Bajiya template');
    fireEvent.click(screen.getByTestId('save-template-save'));
    await waitFor(() => expect(api.createLabelTemplate).toHaveBeenCalledTimes(1));
    const body = api.createLabelTemplate.mock.calls[0][0] as { fields: Record<string, unknown>; size: unknown; source: string };
    expect(body.source).toBe('Bajiya');
    expect(body.size).toBeNull();
    expect(body.fields).toMatchObject({ label_storage: 'chilled', label_heading: 'HOMEMADE SAUCE', label_shelf_life_days: 14, label_pack_unit: 'G' });
    for (const key of ['label_ingredients', 'label_ingredients_dv', 'label_barcode', 'label_photo_media_id', 'label_enabled']) expect(body.fields).not.toHaveProperty(key);
  });

  // The drag designer (round 8): a drag on the full sticker's preview is saved to the item at once, like a tap's sheet.
  it('saves a dragged part to the item straight away and Back to automatic forgets it', async () => {
    api.stickerLinks.mockResolvedValue({ url: '/labels/stickers?signature=x', one_url: '/labels/stickers?one=1&signature=x', summary: { design: 'full', spots: [{ key: 'name', x: 9, y: 36.5, w: 87, h: 15 }] } });
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 210, height: 297, left: 0, top: 0, right: 210, bottom: 297, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    render(<ItemLabelTab itemId={7} />);
    await screen.findByRole('button', { name: 'Change the name' });
    fireEvent.click(screen.getByTestId('arrange-switch'));
    const name = await screen.findByRole('button', { name: 'Move the name' });
    expect(screen.queryByTestId('item-label-tap-hint')).toBeNull();
    fireEvent.pointerDown(name, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(name, { pointerId: 1, clientX: 60, clientY: 50 });
    await waitFor(() => expect(api.updateItemLabel).toHaveBeenCalledWith(7, { label_layout: { full: { name: { dx: 5, dy: 0, s: 1 } } } }));
    await waitFor(() => expect(screen.getByTestId('arrange-reset')).toBeEnabled());
    fireEvent.click(screen.getByTestId('arrange-reset'));
    await waitFor(() => expect(api.updateItemLabel).toHaveBeenLastCalledWith(7, { label_layout: null }));
    rect.mockRestore();
  });
});
