import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { LabelType } from '../../api';
import { QuickEditSheet, quickSpec, type QuickContext } from './QuickEdit';

/*
 * The sheet a tap on the preview opens (round 3, 2026-10-13): only the boxes
 * that change the part tapped, a line saying where a part comes from when it
 * is not the label's own, and Done.
 */
const type = (id: number, name: string, brand: string | null = null): LabelType => ({
  id, brand_id: null, brand_name: brand, name, heading: name.toUpperCase(), heading_dv: null, storage: 'frozen', storage_line: null, storage_line_dv: null,
  use_within: null, use_within_dv: null, mfg_label: 'MFG DATE', exp_label: 'EXP DATE', how_to_use: null, how_to_use_dv: null, note: null, note_dv: null,
  shelf_life_days: 90, show_qr: true, footer_id: null, is_active: true, sort: 1, items_count: 0, defaults: { storage_line: '', storage_line_dv: '' },
});

const custom: QuickContext = {
  kind: 'custom', mainBrand: 'Bake & Grill',
  types: [type(1, 'Frozen Hedhika'), type(2, 'Amma Chutney', 'Amma')],
  brands: [{ id: 1, name: 'Bake & Grill', name_dv: null, tagline: null, tagline_dv: null, logo_media_id: null, logo_url: null, is_default: true, sort: 1, types_count: 1 }, { id: 2, name: 'Amma', name_dv: null, tagline: null, tagline_dv: null, logo_media_id: null, logo_url: null, is_default: false, sort: 2, types_count: 1 }],
  defaults: { heading: 'CHILLED', brand: 'Bake & Grill', unit: 'PCS', shelf_life_days: 14 },
  hasPhoto: true,
};
const item: QuickContext = { kind: 'item', types: custom.types, defaults: { brand: 'Amma' }, allergens: ['egg', 'gluten'], menuPrice: 12.5, nutritionWords: 'From the recipe (120 g).', hasPhoto: false };

describe('quickSpec', () => {
  it('gives each part its own boxes, for a custom label and for a menu item', () => {
    const brand = quickSpec('brand', custom);
    expect(brand.inputs.map((i) => i.key)).toEqual(['brand_id']);
    expect(brand.inputs[0].options?.map((o) => o.label)).toEqual(['As the label type (Bake & Grill)', 'Bake & Grill (main)', 'Amma']);
    expect(brand.note).toContain("the footer is always Bake & Grill's");
    // A menu item's brand is its type's: the sheet picks the type.
    expect(quickSpec('brand', item).inputs.map((i) => i.key)).toEqual(['label_type_id']);
    expect(quickSpec('brand', item).note).toContain('(Amma)');

    expect(quickSpec('heading', custom).inputs.map((i) => i.key)).toEqual(['label_type_id', 'label_heading', 'label_heading_dv']);
    expect(quickSpec('heading', custom).inputs[1].placeholder).toBe('CHILLED');
    expect(quickSpec('name', custom).inputs.map((i) => i.key)).toEqual(['name', 'name_dv']);
    // A menu item's name is the menu's: nothing to type, a line saying where to change it.
    expect(quickSpec('name', item).inputs).toEqual([]);
    expect(quickSpec('name', item).note).toContain("The name is the menu item's");
    expect(quickSpec('dates', custom).inputs[0]).toMatchObject({ key: 'label_shelf_life_days', placeholder: '14 from the type' });
    expect(quickSpec('qty', custom).inputs.map((i) => i.key)).toEqual(['label_pack_qty', 'label_pack_unit', 'label_net_weight']);
    expect(quickSpec('price', custom).inputs.map((i) => i.key)).toEqual(['label_price']);
    expect(quickSpec('price', item).inputs.map((i) => [i.key, i.kind])).toEqual([['label_show_price', 'switch'], ['label_price', 'number']]);
    expect(quickSpec('price', item).inputs[1].placeholder).toBe('12.50');
    expect(quickSpec('ingredients', item).inputs.map((i) => i.key)).toEqual(['label_ingredients_source', 'label_ingredients', 'label_ingredients_dv']);
    expect(quickSpec('ingredients', item).note).toContain('egg, gluten');
    expect(quickSpec('nutrition', item)).toMatchObject({ note: 'From the recipe (120 g).', inputs: [{ key: 'label_show_nutrition', kind: 'switch' }] });
    expect(quickSpec('nutrition', custom).inputs.map((i) => i.key)).toEqual(['label_nutrition', 'label_nutrition_per']);
    expect(quickSpec('storage', custom).inputs[0].options?.[0]).toEqual({ value: '', label: 'As the label type' });
    expect(quickSpec('storage', item).inputs[0].options?.map((o) => o.value)).toEqual(['frozen', 'chilled', 'ambient']);
    expect(quickSpec('footer', custom).inputs.map((i) => i.key)).toEqual(['footer_id', 'label_show_qr']);
    expect(quickSpec('footer', item).inputs).toEqual([]);
    // Parts that are print options or settings say so and point at the page.
    expect(quickSpec('batch_qr', custom)).toMatchObject({ inputs: [], link: { to: '/labels/settings' } });
    expect(quickSpec('promo', item)).toMatchObject({ inputs: [], link: { to: '/labels/stickers' } });
    expect(quickSpec('batch', custom)).toMatchObject({ inputs: [], link: { to: '/labels/stickers' } });
    // The picture is chosen by the host; a label with one can drop it.
    expect(quickSpec('photo', custom).actions?.map((a) => a.key)).toEqual(['photo', 'remove_photo']);
    expect(quickSpec('photo', item).actions?.map((a) => a.key)).toEqual(['photo']);
  });
});

describe('QuickEditSheet', () => {
  it('shows the boxes from the host\'s values and hands every change back typed', () => {
    const onChange = vi.fn();
    const onDone = vi.fn();
    const onAll = vi.fn();
    render(
      <MemoryRouter>
        <QuickEditSheet spec={quickSpec('heading', custom)} values={{ label_type_id: 2, label_heading: '', label_heading_dv: '' }} onChange={onChange} onDone={onDone} onAll={onAll} />
      </MemoryRouter>,
    );
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveTextContent('Heading');
    expect(sheet).toHaveTextContent('The heading comes from the label type');
    expect(within(sheet).getByLabelText('Label type')).toHaveValue('2');
    fireEvent.change(within(sheet).getByLabelText('Label type'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('label_type_id', null);
    fireEvent.change(within(sheet).getByLabelText('Label type'), { target: { value: '1' } });
    expect(onChange).toHaveBeenLastCalledWith('label_type_id', 1);
    // A custom label's heading is typed in capitals.
    fireEvent.change(within(sheet).getByLabelText('Heading (top of the sticker)'), { target: { value: 'Garlic' } });
    expect(onChange).toHaveBeenLastCalledWith('label_heading', 'GARLIC');
    expect(within(sheet).getByLabelText('Heading (top of the sticker)')).toHaveAttribute('placeholder', 'CHILLED');
    fireEvent.click(within(sheet).getByRole('button', { name: 'All details' }));
    expect(onAll).toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('shows a switch, actions and a link, and no All details button when the long form is on screen', () => {
    const onChange = vi.fn();
    const onAction = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <QuickEditSheet spec={quickSpec('price', item)} values={{ label_show_price: false, label_price: '' }} onChange={onChange} onDone={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByLabelText('Print the price'));
    expect(onChange).toHaveBeenLastCalledWith('label_show_price', true);
    expect(screen.queryByRole('button', { name: 'All details' })).toBeNull();

    rerender(
      <MemoryRouter>
        <QuickEditSheet spec={quickSpec('photo', custom)} values={{}} onChange={onChange} onAction={onAction} onDone={() => {}} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove the picture' }));
    expect(onAction).toHaveBeenCalledWith('remove_photo');

    rerender(
      <MemoryRouter>
        <QuickEditSheet spec={quickSpec('batch_qr', custom)} values={{}} onChange={onChange} onDone={() => {}} saving />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Labels → Settings' })).toHaveAttribute('href', '/labels/settings');
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});
