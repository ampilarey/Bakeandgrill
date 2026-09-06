import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ModifiersPage } from '../pages/ModifiersPage';
import { ChildSizeSelect, sizeOptionsFromSelection } from '../pages/MenuPage/ChildSizeSelect';
import { itemToForm, formToPayload } from '../pages/MenuPage/menuItemForm';
import type { MenuItem } from '../api';

/*
 * Menu-item stock audit, 2026-09-07 — the admin side of three fixes:
 * add-ons get a screen and an ingredient (finding 11), a sized child in a
 * bundle or platter says which size (finding 6), and the form carries it.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));

const fetchModifiers = vi.fn();
const createModifier = vi.fn();
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchModifiers: (...a: unknown[]) => fetchModifiers(...a),
    createModifier: (...a: unknown[]) => createModifier(...a),
    updateModifier: vi.fn(),
    deleteModifier: vi.fn(),
    fetchInventoryItems: vi.fn().mockResolvedValue({
      data: [{ id: 9, name: 'Cheese', unit: 'g', quantity_on_hand: 1000, reorder_level: null }],
      meta: { current_page: 1, last_page: 1, total: 1 },
      units: ['g'],
    }),
    fetchAdminItems: vi.fn().mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, total: 0 } }),
  };
});

const cheese = {
  id: 1, name: 'Extra cheese', name_dv: null, price: 5, is_active: true, sort_order: 0,
  inventory_item_id: 9, ingredient_quantity: 20, ingredient_unit: 'g',
  inventory_item: { id: 9, name: 'Cheese', unit: 'g' },
};

describe('Add-ons page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchModifiers.mockResolvedValue({ modifiers: [cheese] });
    createModifier.mockResolvedValue({ modifier: { ...cheese, id: 2, name: 'Extra egg' } });
  });

  it('says what each add-on uses', async () => {
    render(<MemoryRouter><ModifiersPage /></MemoryRouter>);
    expect(await screen.findByText('Extra cheese')).toBeInTheDocument();
    expect(screen.getByText('20 g Cheese')).toBeInTheDocument();
  });

  it('creates an add-on with the ingredient it draws', async () => {
    render(<MemoryRouter><ModifiersPage /></MemoryRouter>);
    await screen.findByText('Extra cheese');

    fireEvent.click(screen.getByRole('button', { name: '+ New add-on' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Extra egg' } });
    await waitFor(() => expect(screen.getByTestId('modifier-ingredient').querySelectorAll('option').length).toBeGreaterThan(1));
    fireEvent.change(screen.getByTestId('modifier-ingredient'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Amount per add-on'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(createModifier).toHaveBeenCalled());
    expect(createModifier.mock.calls[0][0]).toMatchObject({
      name: 'Extra egg', inventory_item_id: 9, ingredient_quantity: 1, ingredient_unit: 'g',
    });
  });

  it('refuses an ingredient with no amount', async () => {
    render(<MemoryRouter><ModifiersPage /></MemoryRouter>);
    await screen.findByText('Extra cheese');
    fireEvent.click(screen.getByRole('button', { name: '+ New add-on' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Extra egg' } });
    await waitFor(() => expect(screen.getByTestId('modifier-ingredient').querySelectorAll('option').length).toBeGreaterThan(1));
    fireEvent.change(screen.getByTestId('modifier-ingredient'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/how much of the ingredient/)).toBeInTheDocument();
    expect(createModifier).not.toHaveBeenCalled();
  });
});

describe('Which size goes in a bundle', () => {
  const coke = {
    id: 5, name: 'Coke', has_variants: true, base_price: 0, is_available: true,
    variants: [
      { id: 51, name: 'Small', price: 10, is_active: true },
      { id: 52, name: 'Large', price: 15, is_active: true },
      { id: 53, name: 'Old', price: 12, is_active: false },
    ],
  } as unknown as MenuItem;

  it('offers the active sizes of a sized child, and nothing for a sizeless one', () => {
    expect(sizeOptionsFromSelection({ id: 5, label: 'Coke', item: coke })).toEqual([
      { id: 51, name: 'Small' }, { id: 52, name: 'Large' },
    ]);
    expect(sizeOptionsFromSelection({ id: 6, label: 'Bun', item: { id: 6, name: 'Bun', has_variants: false } as unknown as MenuItem })).toEqual([]);
  });

  it('lets the owner pick the size and reports it', () => {
    const onChange = vi.fn();
    render(
      <ChildSizeSelect
        row={{ item_id: '5', item_name: 'Coke', variant_id: '', size_options: [{ id: 51, name: 'Small' }, { id: 52, name: 'Large' }] }}
        testId="size"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByTestId('size'), { target: { value: '52' } });
    expect(onChange).toHaveBeenCalledWith('52', 'Large');
  });

  it('shows nothing at all for a child without sizes', () => {
    const { container } = render(
      <ChildSizeSelect row={{ item_id: '6', item_name: 'Bun', variant_id: '', size_options: [] }} testId="size" onChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('carries the size through the form and back out in the payload', () => {
    const item = {
      id: 1, name: 'Combo', base_price: 50, is_available: true, is_combo: true,
      combo_items: [
        { item_id: 5, quantity: 1, is_optional: false, variant_id: 52, variant: { id: 52, name: 'Large', price: 15 }, item: { id: 5, name: 'Coke', base_price: 0 } },
      ],
    } as unknown as MenuItem;
    const form = itemToForm(item);
    expect(form.combo_items[0]).toMatchObject({ item_id: '5', variant_id: '52', variant_name: 'Large' });

    const payload = formToPayload(form, false);
    expect(payload.combo_items?.[0]).toMatchObject({ item_id: 5, variant_id: 52, quantity: 1 });
  });
});
