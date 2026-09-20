import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { RecipeEditorModal } from '../pages/MenuPage/RecipeEditorModal';
import type { ItemWithRecipe } from '../api';

/*
 * Owner, 2026-09-07: "water has 500ml bottles and 1.5L bottles. In menu it's
 * as one item with variants." Each size is a different thing on the shelf,
 * so a recipe row can belong to one size.
 *
 * Owner, 2026-09-21: "select variant, add recipe separately" — a tab per
 * size, plus "Every size" for what they share. The rows are the same
 * underneath; only where you look at them changed.
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

const ingredientValues = () => screen.queryAllByLabelText('Ingredient').map((s) => (s as HTMLSelectElement).value);
const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) });

describe('Recipe editor — a tab per size', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchInventoryItems.mockResolvedValue({ data: [inv(30, 'Paper cup', 0.5), inv(31, 'Water 500ml', 4), inv(32, 'Water 1.5L', 9)], meta: { last_page: 1 } });
    saveItemRecipe.mockResolvedValue({ item: water });
  });

  it('opens on the first size, shows only its rows, and costs every size in the strip', async () => {
    render(<RecipeEditorModal item={water} onClose={() => {}} onSaved={() => {}} />);
    await screen.findByRole('tablist', { name: 'Recipe for' });

    expect(tab('500ml')).toHaveAttribute('aria-selected', 'true');
    expect(ingredientValues()).toEqual(['31']);
    expect(screen.getByTestId('recipe-tab-note').textContent).toContain('belong to 500ml alone');

    fireEvent.click(tab('1.5L'));
    expect(ingredientValues()).toEqual(['32']);
    fireEvent.click(tab('Every size'));
    expect(ingredientValues()).toEqual(['30']);
    expect(screen.getByTestId('recipe-tab-note').textContent).toContain('shared by every size');

    // Shared cup 0.50 + own bottle: 4.50 for 500ml, 9.50 for 1.5L, whichever tab is open.
    expect(screen.getByTestId('recipe-size-cost-1')).toHaveTextContent('MVR 4.50');
    expect(screen.getByTestId('recipe-size-cost-1')).toHaveTextContent('MVR 5.50');
    expect(screen.getByTestId('recipe-size-cost-2')).toHaveTextContent('MVR 9.50');
    expect(screen.getByTestId('recipe-size-cost-2')).toHaveTextContent('MVR 10.50');
    // The base-price stat block is not shown for a sized dish.
    expect(screen.queryByText('Selling price')).toBeNull();
  });

  it('adds a row to the open size and sends the size with each row when saving', async () => {
    render(<RecipeEditorModal item={water} onClose={() => {}} onSaved={() => {}} />);
    await screen.findByRole('tablist', { name: 'Recipe for' });

    fireEvent.click(tab('1.5L'));
    fireEvent.click(screen.getByRole('button', { name: '+ Add ingredient for 1.5L' }));
    const selects = screen.getAllByLabelText('Ingredient');
    expect(selects).toHaveLength(2);
    fireEvent.change(selects[1], { target: { value: '30' } });
    fireEvent.change(screen.getAllByLabelText('Quantity')[1], { target: { value: '2' } });
    // 9 + 0.5 shared + 2 × 0.5 own = 10.50
    expect(within(screen.getByTestId('recipe-size-cost-2')).getByText('MVR 10.50')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }));
    await waitFor(() => expect(saveItemRecipe).toHaveBeenCalledTimes(1));
    expect(saveItemRecipe).toHaveBeenCalledWith(5, [
      { inventory_item_id: 30, quantity: 1, unit: 'pcs', variant_id: null },
      { inventory_item_id: 31, quantity: 1, unit: 'pcs', variant_id: 1 },
      { inventory_item_id: 32, quantity: 1, unit: 'pcs', variant_id: 2 },
      { inventory_item_id: 30, quantity: 2, unit: 'pcs', variant_id: 2 },
    ], true, 'sale', 1);
  });

  it('warns on an empty size and can copy another size or start one ingredient per size', async () => {
    const fresh: ItemWithRecipe = { ...water, recipe: { ...water.recipe!, ingredients: [] } };
    render(<RecipeEditorModal item={fresh} onClose={() => {}} onSaved={() => {}} />);
    await screen.findByRole('tablist', { name: 'Recipe for' });

    const warn = screen.getByTestId('recipe-empty-size');
    expect(warn.textContent).toContain('500ml has no ingredients, so it costs nothing and takes no stock.');
    expect(within(warn).queryByRole('button', { name: /Copy from/ })).toBeNull();

    fireEvent.click(within(warn).getByRole('button', { name: 'One ingredient per size' }));
    expect(ingredientValues()).toEqual(['']);
    fireEvent.change(screen.getByLabelText('Ingredient'), { target: { value: '31' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1' } });

    fireEvent.click(tab('1.5L'));
    expect(ingredientValues()).toEqual(['']);
    fireEvent.click(screen.getByLabelText('Remove ingredient'));
    fireEvent.click(within(screen.getByTestId('recipe-empty-size')).getByRole('button', { name: 'Copy from 500ml' }));
    expect(ingredientValues()).toEqual(['31']);
    expect(screen.getByTestId('recipe-size-cost-2')).toHaveTextContent('MVR 4.00');
  });

  it('hides the tabs and the strip for a dish with no sizes', async () => {
    const plain: ItemWithRecipe = { ...water, variants: [], variant_costs: [], recipe: { ...water.recipe!, ingredients: [water.recipe!.ingredients[0]] } };
    render(<RecipeEditorModal item={plain} onClose={() => {}} onSaved={() => {}} />);
    await screen.findByRole('button', { name: 'Save recipe' });
    expect(screen.queryByRole('tablist', { name: 'Recipe for' })).toBeNull();
    expect(screen.queryByTestId('recipe-size-costs')).toBeNull();
    expect(screen.getByText('Selling price')).toBeInTheDocument();
  });
});
