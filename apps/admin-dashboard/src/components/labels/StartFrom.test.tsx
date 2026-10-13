import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LabelTemplate } from '../../api';

/*
 * Start from and Save as template (round 7, 2026-10-13): one select with the
 * built-in templates, the saved ones and every other label to copy from; a
 * button that keeps a label's settings under a name.
 */
const api = vi.hoisted(() => ({ fetchLabelTemplates: vi.fn(), fetchCustomLabels: vi.fn(), fetchLabelProducts: vi.fn(), createLabelTemplate: vi.fn() }));
vi.mock('../../api', () => api);
const toast = vi.hoisted(() => vi.fn());
vi.mock('../ui', async () => {
  const actual = await vi.importActual<typeof import('../ui')>('../ui');
  return { ...actual, useToast: () => ({ toast }) };
});

import { SaveAsTemplate, StartFromRow } from './StartFrom';

const WRAP = { parts: ['brand', 'legal'], band: true, band_text: '', band_text_dv: '', marks: [], pictures: [], text_heading: '', text_heading_dv: '', text: '', text_dv: '' };
const tpl = (id: number | string, name: string, builtin: boolean, extra: Partial<LabelTemplate> = {}): LabelTemplate => ({
  id, builtin, name, blurb: null, source: null, fields: { label_storage: 'chilled', label_heading: 'HOMEMADE SAUCE', label_shelf_life_days: 14 }, wrap_pictures: [], size: { shape: 'rect', preset: 'r60x40', on: 'sheet', w: 60, h: 40 },
  type_name: null, brand_name: null, footer_name: null, storage: 'chilled', created_by: null, created_at: null, ...extra,
});
const customLabel = (id: number, name: string) => ({
  id, kind: 'custom', name, name_dv: null, brand_id: 2, brand_name: 'Amma', brand_logo_url: null, label_type_id: null, label_type_name: null, label_storage: null, storage: 'chilled',
  label_heading: 'JAR', label_heading_dv: null, label_storage_line: null, label_storage_line_dv: null, label_ingredients: 'Garlic', label_ingredients_dv: null, label_how_to_use: null, label_how_to_use_dv: null,
  label_note: null, label_note_dv: null, footer_id: null, footer_name: null, label_show_qr: null, label_lang: null, print_count: 0, last_printed_at: null, label_shelf_life_days: 7, label_pack_qty: null, label_pack_unit: null,
  label_price: null, label_barcode: null, label_net_weight: null, label_allergens: null, label_nutrition: null, label_nutrition_per: 'g', label_wrap: WRAP, wrap_pictures: [], label_layout: {},
  label_photo_media_id: null, label_photo_url: null, label_title_media_id: null, label_title_url: null,
  defaults: { heading: '', heading_dv: '', storage_line: '', storage_line_dv: '', how_to_use: '', how_to_use_dv: '', note: '', note_dv: '', shelf_life_days: null, brand: 'Amma', unit: 'PCS' },
  ingredients: { en: 'Garlic', dv: '', from: 'manual' }, created_by: null, updated_at: null,
});
const product = (id: number, name: string, on = true) => ({
  id, name, name_dv: null, label_enabled: on, label_ingredients_source: 'auto', label_ingredients: null, label_ingredients_dv: null, label_shelf_life_days: 90, label_storage: 'frozen', label_pack_qty: null,
  label_heading: null, label_heading_dv: null, label_storage_line: null, label_storage_line_dv: null, label_note: null, label_note_dv: null, label_pack_unit: null, label_type_id: null, label_type_name: null,
  label_how_to_use: null, label_how_to_use_dv: null, label_price: null, label_show_price: false, label_barcode: null, label_net_weight: null, label_show_nutrition: false,
  nutrition: { complete: false, per100: {}, grams: 0, missing: [], unweighed: [], rows: [] }, label_nutrition_per: 'g', label_wrap: WRAP, wrap_pictures: [], label_layout: {}, menu_price: 5, allergens: [],
  defaults: { heading: 'FROZEN HEDHIKA', heading_dv: '', storage_line: '', storage_line_dv: '', how_to_use: '', how_to_use_dv: '', note: '', note_dv: '', shelf_life_days: null, brand: 'Bake & Grill', unit: 'PCS' },
  label_title_media_id: null, label_title_url: null, label_photo_media_id: null, label_photo_url: null, cutout_url: null, has_recipe: false,
  ingredients: { en: '', dv: '', from: 'none', recipe_en: '', recipe_dv: '' },
});

describe('StartFromRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchLabelTemplates.mockResolvedValue({ data: [tpl(4, 'Jar sauce', false, { source: 'Garlic Sauce' })], builtin: [tpl('sauce-jar', 'Sauce or dip in a jar', true), tpl('frozen-pack', 'Frozen pack', true)] });
    api.fetchCustomLabels.mockResolvedValue({ data: [customLabel(3, 'Garlic Sauce'), customLabel(5, 'Mango chutney')] });
    api.fetchLabelProducts.mockResolvedValue({ data: [product(7, 'Bajiya'), product(8, 'Water', false)] });
  });

  it('lists the built-in templates, your own, and the other labels to copy, and hands over what is picked', async () => {
    const onPick = vi.fn();
    render(<StartFromRow onPick={onPick} exclude={{ kind: 'custom', id: 5 }} />);
    const select = await screen.findByLabelText('Start from');
    await waitFor(() => expect(select).not.toBeDisabled());
    expect(api.fetchLabelProducts).toHaveBeenCalledWith(true);
    const groups = within(select).getAllByRole('group').map((g) => g.getAttribute('label'));
    expect(groups).toEqual(['Built-in templates', 'Your templates', 'Copy a custom label', "Copy a menu item's label"]);
    expect(within(select).getByRole('option', { name: 'Jar sauce (from Garlic Sauce)' })).toBeInTheDocument();
    // The label being edited is left out; an item not on labels too.
    expect(within(select).queryByRole('option', { name: 'Mango chutney' })).toBeNull();
    expect(within(select).queryByRole('option', { name: 'Water' })).toBeNull();
    expect(screen.getByTestId('start-from-hint')).toHaveTextContent('the name and pictures stay yours');

    fireEvent.change(select, { target: { value: 'sauce-jar' } });
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'sauce-jar', name: 'Sauce or dip in a jar' }));
    expect(screen.getByTestId('start-from-hint')).toHaveTextContent('Started from Sauce or dip in a jar.');

    // Another label stands in as a template: its settings, not its name.
    fireEvent.change(select, { target: { value: 'custom:3' } });
    const copied = onPick.mock.calls[1][0] as LabelTemplate;
    expect(copied.fields).toMatchObject({ brand_id: 2, label_heading: 'JAR', label_ingredients: 'Garlic', label_shelf_life_days: 7 });
    expect(copied.fields).not.toHaveProperty('name');
    fireEvent.change(select, { target: { value: 'item:7' } });
    expect((onPick.mock.calls[2][0] as LabelTemplate).fields).toMatchObject({ label_storage: 'frozen', label_shelf_life_days: 90 });
  });

  it('still offers the built-in templates when the other lists cannot be read', async () => {
    api.fetchCustomLabels.mockRejectedValue(new Error('forbidden'));
    api.fetchLabelProducts.mockRejectedValue(new Error('forbidden'));
    render(<StartFromRow onPick={vi.fn()} />);
    const select = await screen.findByLabelText('Start from');
    await waitFor(() => expect(select).not.toBeDisabled());
    expect(within(select).getAllByRole('group').map((g) => g.getAttribute('label'))).toEqual(['Built-in templates', 'Your templates']);
  });
});

describe('SaveAsTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.createLabelTemplate.mockImplementation(async (body: { name: string }) => ({ data: tpl(9, body.name, false) }));
  });

  it('asks for a name, saves the fields with the size, and says so', async () => {
    const onSaved = vi.fn();
    render(<SaveAsTemplate fields={{ label_storage: 'chilled', label_heading: 'HOMEMADE SAUCE' }} at={{ shape: 'rect', preset: 'r60x40', on: 'printer', w: 60, h: 40 }} source="Garlic Sauce" onSaved={onSaved} />);
    fireEvent.click(screen.getByTestId('save-as-template'));
    const box = screen.getByLabelText('Template name');
    expect(box).toHaveValue('Garlic Sauce template');
    expect(screen.getByTestId('save-template')).toHaveTextContent('the size (60 × 40 mm)');
    expect(screen.getByTestId('save-template')).toHaveTextContent('Not the name, pictures, barcode or price');
    fireEvent.change(box, { target: { value: ' Jar sauce ' } });
    fireEvent.click(screen.getByTestId('save-template-save'));
    await waitFor(() => expect(api.createLabelTemplate).toHaveBeenCalledWith({ name: 'Jar sauce', source: 'Garlic Sauce', fields: { label_storage: 'chilled', label_heading: 'HOMEMADE SAUCE' }, size: { shape: 'rect', preset: 'r60x40', on: 'printer', w: 60, h: 40 } }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 9, name: 'Jar sauce' })));
    expect(toast).toHaveBeenCalledWith('success', expect.stringContaining('"Jar sauce" saved'));
    expect(screen.queryByTestId('save-template')).toBeNull();
  });

  it('refuses an empty name and keeps no size when the screen has none', async () => {
    render(<SaveAsTemplate fields={{}} at={null} source="" />);
    fireEvent.click(screen.getByTestId('save-as-template'));
    expect(screen.getByLabelText('Template name')).toHaveValue('');
    fireEvent.click(screen.getByTestId('save-template-save'));
    expect(api.createLabelTemplate).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('error', 'Give the template a name.');
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Bare' } });
    fireEvent.click(screen.getByTestId('save-template-save'));
    await waitFor(() => expect(api.createLabelTemplate).toHaveBeenCalledWith({ name: 'Bare', source: null, fields: {}, size: null }));
  });
});
