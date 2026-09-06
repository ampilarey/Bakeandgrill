import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InventoryPage, { unitOptions } from '../pages/InventoryPage';

/*
 * Three dead ends in the item form, and the general rule behind them.
 *
 * Owner, 2026-09-06: "in inventory edit, cannot see unit list, no pack size
 * edit option, no new catagory option, in all the drop down places if the item
 * is not listed, add option to write so it will be saved in respective field."
 *
 *   - Unit was a bare text box with a placeholder. Nothing said what this
 *     kitchen already measures in, so every item was a fresh guess.
 *   - A pack could be added and deleted, never corrected — a typo in
 *     "500 ml tin" meant destroying the name a purchase order was showing.
 *   - Category listed what existed and stopped there: to file an item under
 *     something new you had to leave the form and come back.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));

const ghee = {
  id: 21,
  name: 'Ghee',
  sku: 'GHEE-1',
  barcode: null,
  unit: 'ml',
  quantity_on_hand: 2500,
  reorder_level: 1000,
  cost_per_unit: 0.19,
  category: { id: 3, name: 'Dry store' },
  is_active: true,
  requestable: false,
  last_counted_at: null,
  created_at: '2026-01-01T00:00:00Z',
  lead_days: 3,
  cover_days: 14,
  storage_location: 'Dry store',
  notes: null,
  preferred_supplier_id: null,
  purchase_units: [{ id: 7, name: '500 ml tin', base_units: 500 }],
};

const getPurchaseUnits = vi.fn();
const updatePurchaseUnit = vi.fn();
const fetchInventoryItems = vi.fn();
const createInventoryCategory = vi.fn();
const createSupplier = vi.fn();
const updateInventoryItem = vi.fn();
const fetchInventoryCategories = vi.fn();
const fetchSuppliers = vi.fn();

vi.mock('../api', () => ({
  getPurchaseUnits: (...a: unknown[]) => getPurchaseUnits(...a),
  updatePurchaseUnit: (...a: unknown[]) => updatePurchaseUnit(...a),
  createInventoryCategory: (...a: unknown[]) => createInventoryCategory(...a),
  createSupplier: (...a: unknown[]) => createSupplier(...a),
  updateInventoryItem: (...a: unknown[]) => updateInventoryItem(...a),
  fetchInventoryItems: (...a: unknown[]) => fetchInventoryItems(...a),
  createPurchaseUnit: vi.fn(),
  deletePurchaseUnit: vi.fn(),
  fetchLowStockItems: vi.fn().mockResolvedValue({ data: [] }),
  fetchInventoryCategories: (...a: unknown[]) => fetchInventoryCategories(...a),
  fetchSuppliers: (...a: unknown[]) => fetchSuppliers(...a),
  getUnitConversions: vi.fn().mockResolvedValue({ conversions: [] }),
  fetchPreparedStock: vi.fn().mockResolvedValue({ rows: [] }),
  adjustInventoryStock: vi.fn(),
  updateInventoryCategory: vi.fn(),
  createUnitConversion: vi.fn(),
  deleteUnitConversion: vi.fn(),
  getInventoryPriceHistory: vi.fn(),
  getInventoryCheapestSupplier: vi.fn(),
  getInventoryCostUsage: vi.fn(),
  submitStockCount: vi.fn(),
  adjustPreparedStock: vi.fn(),
  createInventoryItem: vi.fn(),
  fetchInventoryItemDetail: vi.fn(),
}));

async function openEditor() {
  render(<MemoryRouter><InventoryPage /></MemoryRouter>);
  const buttons = await screen.findAllByTitle('Edit this item');
  fireEvent.click(buttons[0]);
  return await screen.findByTestId('pack-sizes-section');
}

describe('unitOptions', () => {
  it('puts what the store already uses ahead of the common ones', () => {
    // The real vocabulary of this kitchen beats any list I could guess at.
    const opts = unitOptions(['sachet', 'tray'], '');

    expect(opts.slice(0, 2).map((o) => o.value)).toEqual(['sachet', 'tray']);
    expect(opts.map((o) => o.value)).toContain('kg');
  });

  it('keeps the item own unit even when nothing else uses it', () => {
    expect(unitOptions([], 'bushel')[0]).toEqual({ value: 'bushel', label: 'bushel' });
  });

  it('does not list the same unit twice in different letters', () => {
    const values = unitOptions(['KG', 'kg'], 'Kg').map((o) => o.value);

    expect(values.filter((v) => v.toLowerCase() === 'kg')).toHaveLength(1);
  });
});

describe('The item form has no dead ends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'ml',
      purchase_units: [{ id: 7, name: '500 ml tin', base_units: 500 }],
    });
    fetchInventoryItems.mockResolvedValue({
      data: [ghee],
      meta: { current_page: 1, last_page: 1, total: 1 },
      units: ['ml', 'kg', 'sachet'],
    });
    updatePurchaseUnit.mockResolvedValue({ purchase_unit: { id: 7, name: '500ml tin', base_units: 500 } });
    createInventoryCategory.mockResolvedValue({ category: { id: 9, name: 'Spices' } });
    createSupplier.mockResolvedValue({ supplier: { id: 12, name: 'Reefside' } });
    updateInventoryItem.mockResolvedValue({ item: ghee });
    fetchInventoryCategories.mockResolvedValue({ categories: [{ id: 3, name: 'Dry store' }] });
    fetchSuppliers.mockResolvedValue({ data: [{ id: 4, name: 'Fahi Store' }] });
  });

  it('fetches the category and supplier lists when Edit opens', async () => {
    /*
     * Only "+ Add SKU" used to load these, so Edit showed an empty Category
     * dropdown — the item's own category included. Half of "no new catagory
     * option" was that there was no category list at all.
     */
    await openEditor();

    await waitFor(() => expect(fetchInventoryCategories).toHaveBeenCalled());
    expect(fetchSuppliers).toHaveBeenCalled();

    const cat = await screen.findByLabelText('Category');
    expect(within(cat).getByText('Dry store')).toBeInTheDocument();
  });

  it('names the current category rather than printing its id while the list loads', async () => {
    // A select falling back to "3" tells nobody anything.
    fetchInventoryCategories.mockReturnValue(new Promise(() => {}));
    await openEditor();

    const cat = screen.getByLabelText('Category') as HTMLSelectElement;
    expect(cat.value).toBe('3');
    expect(cat.selectedOptions[0].text).toBe('Dry store');
  });

  it('offers the units the store already uses', async () => {
    await openEditor();

    const unit = screen.getByLabelText('Item unit') as HTMLSelectElement;
    const listed = [...unit.options].map((o) => o.value);

    expect(listed).toContain('sachet');
    expect(unit.value).toBe('ml');
  });

  it('takes a unit that is on no list at all', async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText('Item unit'), { target: { value: '__pick_or_type_add__' } });
    fireEvent.change(await screen.findByLabelText('New item unit'), { target: { value: 'bushel' } });
    fireEvent.click(screen.getByText('Use this'));

    await waitFor(() => {
      expect((screen.getByLabelText('Item unit') as HTMLSelectElement).value).toBe('bushel');
    });
  });

  it('makes a category from the form it is needed in', async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '__pick_or_type_add__' } });
    fireEvent.change(await screen.findByLabelText('New category'), { target: { value: 'Spices' } });
    fireEvent.click(screen.getByText('Use this'));

    await waitFor(() => expect(createInventoryCategory).toHaveBeenCalledWith({ name: 'Spices' }));
    await waitFor(() => {
      expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('9');
    });
  });

  it('makes a supplier the same way', async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText('Preferred supplier'), { target: { value: '__pick_or_type_add__' } });
    fireEvent.change(await screen.findByLabelText('New preferred supplier'), { target: { value: 'Reefside' } });
    fireEvent.click(screen.getByText('Use this'));

    await waitFor(() => expect(createSupplier).toHaveBeenCalledWith({ name: 'Reefside' }));
  });

  it('corrects a pack that is already defined', async () => {
    const section = await openEditor();
    fireEvent.click(within(await screen.findByTestId('pack-row-7')).getByText('Edit'));

    fireEvent.change(screen.getByLabelText('Name of 500 ml tin'), { target: { value: '500ml tin' } });
    fireEvent.change(screen.getByLabelText('Amount in 500 ml tin'), { target: { value: '500' } });
    fireEvent.click(within(section).getByText('Save'));

    await waitFor(() => expect(updatePurchaseUnit).toHaveBeenCalledWith(21, 7, {
      name: '500ml tin', base_units: 500,
    }));
  });

  it('says a pack edit does not move stock that already arrived', async () => {
    // The reason it is safe to offer at all: a purchase keeps its own copy of
    // the pack it was entered with.
    const section = await openEditor();

    expect(within(section).getByText(/nothing you have received moves/i)).toBeInTheDocument();
  });

  it('refuses a pack with no name rather than sending it', async () => {
    const section = await openEditor();
    fireEvent.click(within(await screen.findByTestId('pack-row-7')).getByText('Edit'));
    fireEvent.change(screen.getByLabelText('Name of 500 ml tin'), { target: { value: '  ' } });
    fireEvent.click(within(section).getByText('Save'));

    expect(await within(section).findByText('A pack needs a name.')).toBeInTheDocument();
    expect(updatePurchaseUnit).not.toHaveBeenCalled();
  });

  it('leaves the pack alone when the edit is cancelled', async () => {
    const section = await openEditor();
    fireEvent.click(within(await screen.findByTestId('pack-row-7')).getByText('Edit'));
    fireEvent.change(screen.getByLabelText('Name of 500 ml tin'), { target: { value: 'nonsense' } });
    fireEvent.click(within(section).getByText('Cancel'));

    expect(updatePurchaseUnit).not.toHaveBeenCalled();
    // Back to the plain row, name intact. (Scoped to the row: the pack's name
    // is also an option in the "measured in" picker below.)
    const row = within(await screen.findByTestId('pack-row-7'));
    expect(row.getByText('500 ml tin')).toBeInTheDocument();
    expect(row.getByText('Edit')).toBeInTheDocument();
  });
});
