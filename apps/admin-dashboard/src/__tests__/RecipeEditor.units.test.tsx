import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { RecipeEditorModal, unitChoices, unitFactor } from '../pages/MenuPage/RecipeEditorModal';
import type { ItemWithRecipe } from '../api';

/*
 * Audit of item costing, 2026-09-17: the preview multiplied 200 g by the
 * price of a kilo, ignored the yield, took any text as a unit, and said
 * nothing about a typed cost overriding the recipe or a deleted ingredient.
 */

const fetchInventoryItems = vi.fn();
const saveItemRecipe = vi.fn();
const getUnitConversions = vi.fn();
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchInventoryItems: (...a: unknown[]) => fetchInventoryItems(...a),
    saveItemRecipe: (...a: unknown[]) => saveItemRecipe(...a),
    getUnitConversions: (...a: unknown[]) => getUnitConversions(...a),
  };
});

const inv = (id: number, name: string, unit: string, cost: number) => ({
  id, name, unit, cost_per_unit: cost, is_active: true, sku: null, barcode: null, quantity_on_hand: 10,
  reorder_level: null, category: null, requestable: true, gst_rate_bp: null, last_counted_at: null, created_at: '',
  lead_days: null, cover_days: null, storage_location: null, notes: null, preferred_supplier_id: null,
});

const conversions = [
  { id: 1, from_unit: 'g', to_unit: 'kg', factor: 0.001 },
  { id: 2, from_unit: 'ml', to_unit: 'l', factor: 0.001 },
];

function bajiya(over: Partial<ItemWithRecipe> = {}): ItemWithRecipe {
  return {
    id: 7, name: 'Bajiya', base_price: 3, recipe_cost: 8, effective_cost: 8, profit: -5, margin_pct: -166.7,
    variants: [],
    recipe: {
      id: 9, yield_quantity: 1, limits_availability: false, consumed_at: 'sale', instructions: null,
      ingredients: [
        { id: 1, inventory_item_id: 30, inventory_item: { id: 30, name: 'Flour', unit: 'kg', unit_cost: 40 }, variant_id: null, variant: null, quantity: 200, unit: 'g', line_cost: 8, unit_ok: true },
      ],
    },
    ...over,
  };
}

describe('Recipe editor — units, yield and the things it now says', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchInventoryItems.mockResolvedValue({ data: [inv(30, 'Flour', 'kg', 40), inv(31, 'Oil', 'l', 30)], meta: { last_page: 1 } });
    getUnitConversions.mockResolvedValue({ conversions });
    saveItemRecipe.mockResolvedValue({ item: bajiya() });
  });

  it('costs a row in grams at the per-kilo price', async () => {
    render(<RecipeEditorModal item={bajiya()} onClose={() => {}} onSaved={() => {}} />);

    await screen.findByLabelText('Quantity');
    await waitFor(() => expect(screen.getByTestId('recipe-line-cost')).toHaveTextContent('MVR 8.00'));
    expect(screen.getByText('Recipe cost').nextSibling).toHaveTextContent('MVR 8.00');
  });

  it('offers only the units the ingredient can be converted from', async () => {
    render(<RecipeEditorModal item={bajiya()} onClose={() => {}} onSaved={() => {}} />);

    const unit = await screen.findByLabelText('Unit');
    await waitFor(() => expect(within(unit).getAllByRole('option').map((o) => o.textContent)).toEqual(['kg', 'g']));
    expect(unit).toHaveValue('g');
  });

  it('divides by what the rows make and sends the yield when saving', async () => {
    render(<RecipeEditorModal item={bajiya()} onClose={() => {}} onSaved={() => {}} />);

    const makes = await screen.findByLabelText('This recipe makes');
    await waitFor(() => expect(screen.getByTestId('recipe-line-cost')).toHaveTextContent('MVR 8.00'));
    fireEvent.change(makes, { target: { value: '4' } });
    expect(screen.getByTestId('recipe-line-cost')).toHaveTextContent('MVR 2.00');

    fireEvent.click(screen.getByText('Save recipe'));
    await waitFor(() => expect(saveItemRecipe).toHaveBeenCalledTimes(1));
    expect(saveItemRecipe.mock.calls[0][4]).toBe(4);
    expect(saveItemRecipe.mock.calls[0][1]).toEqual([{ inventory_item_id: 30, quantity: 200, unit: 'g', variant_id: null }]);
  });

  it('says when a typed cost on the item is overriding the recipe', async () => {
    render(<RecipeEditorModal item={bajiya({ manual_cost: 1.25, effective_cost: 1.25 })} onClose={() => {}} onSaved={() => {}} />);

    expect(await screen.findByTestId('recipe-manual-cost-notice')).toHaveTextContent('MVR 1.25');
  });

  it('flags a row whose ingredient was deleted, costs the dish as unknown, and will not save it as is', async () => {
    const gone = bajiya({
      recipe_cost: null,
      recipe: {
        id: 9, yield_quantity: 1, limits_availability: false, consumed_at: 'sale', instructions: null,
        ingredients: [
          { id: 1, inventory_item_id: 30, inventory_item: { id: 30, name: 'Flour', unit: 'kg', unit_cost: 40 }, variant_id: null, variant: null, quantity: 200, unit: 'g', line_cost: 8, unit_ok: true },
          { id: 2, inventory_item_id: null as unknown as number, inventory_item: null, variant_id: null, variant: null, quantity: 50, unit: 'ml', line_cost: null, missing_ingredient: true },
        ],
      },
    });
    render(<RecipeEditorModal item={gone} onClose={() => {}} onSaved={() => {}} />);

    expect(await screen.findByTestId('recipe-row-missing')).toBeInTheDocument();
    expect(screen.getByText('Recipe cost').nextSibling).toHaveTextContent('—');

    fireEvent.click(screen.getByText('Save recipe'));
    expect(await screen.findByText(/has been deleted/)).toBeInTheDocument();
    expect(saveItemRecipe).not.toHaveBeenCalled();
  });
});

describe('unit helpers', () => {
  it('reads a conversion in either direction and refuses an unknown pair', () => {
    expect(unitFactor(conversions, 'g', 'kg')).toBe(0.001);
    expect(unitFactor(conversions, 'kg', 'g')).toBe(1000);
    expect(unitFactor(conversions, 'KG', 'kg')).toBe(1);
    expect(unitFactor(conversions, 'cups', 'kg')).toBeNull();
  });

  it('lists the ingredient unit first, then what converts to it', () => {
    expect(unitChoices(conversions, 'kg')).toEqual(['kg', 'g']);
    expect(unitChoices(conversions, 'pcs')).toEqual(['pcs']);
  });
});
