import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { RecipeEditorModal } from '../pages/MenuPage/RecipeEditorModal';
import type { ItemWithRecipe } from '../api';

/*
 * Owner, 2026-09-07: "water has 500ml bottles and 1.5L bottles. In menu it's
 * as one item with variants." Each size is a different thing on the shelf,
 * so a recipe row can belong to one size. The editor shows which size a row
 * is for, costs each size on its own, and sends the size with the row.
 */

const fetchInventoryItems = vi.fn();
const saveItemRecipe = vi.fn();
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchInventoryItems: (...a: unknown[]) => fetchInventoryItems(...a),
    saveItemRecipe: (...a: unknown[]) => saveItemRecipe(...a),
  };
});

const inv = (id: number, name: string, cost: number) => ({
  id, name, unit: 'pcs', cost_per_unit: cost, is_active: true, sku: null, barcode: null, quantity_on_hand: 10,
  reorder_level: null, category: null, requestable: true, gst_rate_bp: null, last_counted_at: null, created_at: '',
  lead_days: null, cover_days: null, storage_location: null, notes: null, preferred_supplier_id: null,
});

const water: ItemWithRecipe = {
  id: 5, name: 'Water', base_price: 10, recipe_cost: 0.5, effective_cost: 0.5, profit: 9.5, margin_pct: 95,
  variants: [
    { id: 1, name: '500ml', consumption_factor: 1 },
    { id: 2, name: '1.5L', consumption_factor: 1 },
  ],
  variant_costs: [
    { variant_id: 1, name: '500ml', price: 10, consumption_factor: 1, cost: 4.5, profit: 5.5, margin_pct: 55 },
    { variant_id: 2, name: '1.5L', price: 20, consumption_factor: 1, cost: 9.5, profit: 10.5, margin_pct: 52.5 },
  ],
  recipe: {
    id: 9, yield_quantity: 1, limits_availability: true, consumed_at: 'sale', instructions: null,
    ingredients: [
      { id: 1, inventory_item_id: 30, inventory_item: { id: 30, name: 'Paper cup', unit: 'pcs', unit_cost: 0.5 }, variant_id: null, variant: null, quantity: 1, unit: 'pcs', line_cost: 0.5 },
      { id: 2, inventory_item_id: 31, inventory_item: { id: 31, name: 'Water 500ml', unit: 'pcs', unit_cost: 4 }, variant_id: 1, variant: { id: 1, name: '500ml' }, quantity: 1, unit: 'pcs', line_cost: 4 },
      { id: 3, inventory_item_id: 32, inventory_item: { id: 32, name: 'Water 1.5L', unit: 'pcs', unit_cost: 9 }, variant_id: 2, variant: { id: 2, name: '1.5L' }, quantity: 1, unit: 'pcs', line_cost: 9 },
    ],
  },
};

describe('Recipe editor — rows per size', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchInventoryItems.mockResolvedValue({ data: [inv(30, 'Paper cup', 0.5), inv(31, 'Water 500ml', 4), inv(32, 'Water 1.5L', 9)], meta: { last_page: 1 } });
    saveItemRecipe.mockResolvedValue({ item: water });
  });

  it('shows which size each row is for and costs each size on its own', async () => {
    render(<RecipeEditorModal item={water} onClose={() => {}} onSaved={() => {}} />);

    const selects = await screen.findAllByLabelText('Which size this row is for');
    expect(selects.map((s) => (s as HTMLSelectElement).value)).toEqual(['', '1', '2']);

    // Shared cup 0.50 + own bottle: 4.50 for 500ml, 9.50 for 1.5L.
    const small = screen.getByTestId('recipe-size-cost-1');
    expect(small).toHaveTextContent('MVR 4.50');
    expect(small).toHaveTextContent('MVR 5.50');
    const large = screen.getByTestId('recipe-size-cost-2');
    expect(large).toHaveTextContent('MVR 9.50');
    expect(large).toHaveTextContent('MVR 10.50');
  });

  it('sends the size with each row when saving', async () => {
    render(<RecipeEditorModal item={water} onClose={() => {}} onSaved={() => {}} />);
    const selects = await screen.findAllByLabelText('Which size this row is for');

    // Move the 1.5L bottle row to "All sizes" and watch the costs follow.
    fireEvent.change(selects[2], { target: { value: '' } });
    expect(within(screen.getByTestId('recipe-size-cost-1')).getByText('MVR 13.50')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }));
    await waitFor(() => expect(saveItemRecipe).toHaveBeenCalledTimes(1));
    expect(saveItemRecipe).toHaveBeenCalledWith(5, [
      { inventory_item_id: 30, quantity: 1, unit: 'pcs', variant_id: null },
      { inventory_item_id: 31, quantity: 1, unit: 'pcs', variant_id: 1 },
      { inventory_item_id: 32, quantity: 1, unit: 'pcs', variant_id: null },
    ], true, 'sale');
  });

  it('hides the size column for a dish with no sizes', async () => {
    const plain: ItemWithRecipe = { ...water, variants: [], variant_costs: [], recipe: { ...water.recipe!, ingredients: [water.recipe!.ingredients[0]] } };
    render(<RecipeEditorModal item={plain} onClose={() => {}} onSaved={() => {}} />);
    await screen.findByRole('button', { name: 'Save recipe' });
    expect(screen.queryByLabelText('Which size this row is for')).toBeNull();
    expect(screen.queryByTestId('recipe-size-costs')).toBeNull();
  });
});
