/**
 * Reordering sizes in the item editor.
 *
 * The order of this list is the order the till's size popup, the website and
 * the app all show. Until now the only way to change it was to type numbers
 * into the Sort column of the quick-edit sheet — not where anybody looks when
 * they are already staring at the list of sizes.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MenuItemEditorModal } from './MenuItemEditorModal';
import { emptyItemForm, formToPayload, type ItemForm } from './menuItemForm';

vi.mock('../../hooks/useGstBootstrap', () => ({
  useGstBootstrap: () => ({ loading: false, codes: [], defaultCode: 'standard_8' }),
}));

function sizedForm() {
  const form = emptyItemForm(1);
  form.name = 'Water';
  form.base_price = '0';
  form.has_variants = true;
  form.variants = [
    { _key: 'a', name: 'Small', price: 10, cost: null, sku: null, track_stock: false, stock_qty: 0, low_stock_threshold: 5, consumption_factor: 1, is_active: true, sort_order: 0 },
    { _key: 'b', name: 'Medium', price: 15, cost: null, sku: null, track_stock: false, stock_qty: 0, low_stock_threshold: 5, consumption_factor: 1, is_active: true, sort_order: 1 },
    { _key: 'c', name: 'Large', price: 20, cost: null, sku: null, track_stock: false, stock_qty: 0, low_stock_threshold: 5, consumption_factor: 1, is_active: true, sort_order: 2 },
  ];

  return form;
}

function renderEditor(onSave = vi.fn(async (_form: ItemForm) => {})) {
  render(
    <MenuItemEditorModal
      title="Edit item"
      initial={sizedForm()}
      categories={[{ id: 1, name: 'Drinks', is_active: true, sort_order: 0 }]}
      menuGroups={[{ id: 1, name: 'Default', slug: 'default', is_active: true, sort_order: 0 }]}
      onSave={onSave}
      onClose={() => {}}
    />,
  );

  return onSave;
}

/** The size name boxes, top to bottom. */
function order(): string[] {
  return screen.getAllByPlaceholderText('e.g. Large').map((el) => (el as HTMLInputElement).value);
}

describe('reordering sizes', () => {
  it('moves a size up', () => {
    renderEditor();
    expect(order()).toEqual(['Small', 'Medium', 'Large']);

    fireEvent.click(screen.getByRole('button', { name: 'Move Large up' }));

    expect(order()).toEqual(['Small', 'Large', 'Medium']);
  });

  it('moves a size down', () => {
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Move Small down' }));

    expect(order()).toEqual(['Medium', 'Small', 'Large']);
  });

  it('cannot move the first size up or the last one down', () => {
    // Nothing to swap with — a wrap-around would look like a bug.
    renderEditor();

    expect(screen.getByRole('button', { name: 'Move Small up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Large down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Medium up' })).not.toBeDisabled();
  });

  it('hands the reordered list to the save', async () => {
    const onSave = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Move Large up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Large up' }));
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }));

    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());

    const saved = onSave.mock.calls[0]?.[0];
    expect(saved?.variants.map((v) => v.name)).toEqual(['Large', 'Small', 'Medium']);
  });

  it('numbers sort_order by position when the payload is built', () => {
    // The modal hands up the form; formToPayload is what stamps sort_order,
    // and it stamps from the index — so the list order is the thing that
    // travels, and the stale numbers on the rows do not.
    const form = sizedForm();
    form.variants = [form.variants[2], form.variants[0], form.variants[1]];

    const payload = formToPayload(form, false) as unknown as {
      variants: Array<{ name: string; sort_order: number }>;
    };

    expect(payload.variants.map((v) => [v.name, v.sort_order])).toEqual([
      ['Large', 0],
      ['Small', 1],
      ['Medium', 2],
    ]);
  });

  it('keeps everything else on the row it belongs to', () => {
    // A swap that carried the name but left the price behind would price the
    // wrong size, and the grid would look right while doing it.
    renderEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Move Large up' }));

    const prices = screen.getAllByDisplayValue(/^(10|15|20)$/).map((el) => (el as HTMLInputElement).value);
    expect(prices).toEqual(['10', '20', '15']);
  });
});
