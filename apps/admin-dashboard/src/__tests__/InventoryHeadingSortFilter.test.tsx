import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';

/*
 * Owner, 2026-09-13: "in inventory add sort and filter option to heading."
 *
 * Every column heading sorts the list — tap for one way, again for the
 * other — and has a box under it that narrows the list. The dropdown and
 * the headings drive one sort key, so the arrow always agrees with it.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));
vi.mock('../api/operations', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/operations')>(),
  getBrandPhotos: vi.fn().mockResolvedValue({ item_id: 1, photos: [] }),
  uploadBrandPhoto: vi.fn(),
  deleteBrandPhoto: vi.fn(),
}));

const base = {
  barcode: null, is_active: true, requestable: false, last_counted_at: null, created_at: '2026-01-01T00:00:00Z',
  lead_days: null, cover_days: null, storage_location: null, notes: null, preferred_supplier_id: null, purchase_units: [],
  cost_per_unit: 1,
};
const water = { ...base, id: 1, name: 'Water', sku: 'WTR-1', unit: 'bottle', quantity_on_hand: 15, reorder_level: 20, category: { id: 1, name: 'Drinks' }, usage_per_day: 5, bought_per_day: 4, days_left: 3 };
const rice = { ...base, id: 2, name: 'Rice', sku: 'RCE-1', unit: 'kg', quantity_on_hand: 240, reorder_level: 50, category: { id: 2, name: 'Dry' }, usage_per_day: 2, bought_per_day: 10, days_left: 120 };
const gas = { ...base, id: 3, name: 'Gas', sku: null, unit: 'piece', quantity_on_hand: 2, reorder_level: null, category: null, usage_per_day: 0, bought_per_day: 0.1, days_left: 20 };

const fetchInventoryItems = vi.fn();

vi.mock('../api', () => ({
  fetchInventoryItems: (...a: unknown[]) => fetchInventoryItems(...a),
  fetchLowStockItems: vi.fn().mockResolvedValue({ data: [] }),
  fetchInventoryCategories: vi.fn().mockResolvedValue({ categories: [] }),
  fetchSuppliers: vi.fn().mockResolvedValue({ data: [] }),
  getUnitConversions: vi.fn().mockResolvedValue({ conversions: [] }),
  fetchPreparedStock: vi.fn().mockResolvedValue({ rows: [] }),
  getPurchaseUnits: vi.fn().mockResolvedValue({ base_unit: 'kg', purchase_units: [] }),
  adjustInventoryStock: vi.fn(),
  createInventoryCategory: vi.fn(),
  updateInventoryCategory: vi.fn(),
  createUnitConversion: vi.fn(),
  deleteUnitConversion: vi.fn(),
  getInventoryPriceHistory: vi.fn(),
  getInventoryCheapestSupplier: vi.fn(),
  submitStockCount: vi.fn(),
  adjustPreparedStock: vi.fn(),
  createInventoryItem: vi.fn(),
  updateInventoryItem: vi.fn(),
  fetchInventoryItemDetail: vi.fn(),
  createPurchaseUnit: vi.fn(),
  updatePurchaseUnit: vi.fn(),
  deletePurchaseUnit: vi.fn(),
}));

/** The item names in the order the table shows them. */
const listed = () => screen.getAllByRole('row')
  .filter((r) => r.querySelector('td'))
  .map((r) => r.querySelector('td')!.textContent?.split('Buys as')[0].replace('Archived', '').trim());

async function show() {
  render(<MemoryRouter><InventoryPage /></MemoryRouter>);
  await screen.findByText('Water');
}

describe('Sorting and filtering from the headings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fetchInventoryItems.mockResolvedValue({
      data: [water, rice, gas],
      meta: { current_page: 1, last_page: 1, total: 3 },
      units: [],
    });
  });

  it('sorts by a heading on the first tap and the other way on the second', async () => {
    await show();
    expect(listed()).toEqual(['Gas', 'Rice', 'Water']);

    fireEvent.click(screen.getByTestId('inventory-sort-on_hand'));
    expect(listed()).toEqual(['Gas', 'Water', 'Rice']);
    expect(screen.getByTestId('inventory-sort-on_hand').closest('th')).toHaveAttribute('aria-sort', 'ascending');

    fireEvent.click(screen.getByTestId('inventory-sort-on_hand'));
    expect(listed()).toEqual(['Rice', 'Water', 'Gas']);
    expect(screen.getByTestId('inventory-sort-on_hand').closest('th')).toHaveAttribute('aria-sort', 'descending');
  });

  it('keeps the dropdown and the headings on one sort key', async () => {
    await show();

    fireEvent.click(screen.getByTestId('inventory-sort-status'));

    // The dropdown followed the heading…
    expect(screen.getByLabelText('Sort items')).toHaveValue('low_first');
    expect(listed()[0]).toBe('Water');
    // …and the heading follows the dropdown.
    fireEvent.change(screen.getByLabelText('Sort items'), { target: { value: 'name_desc' } });
    expect(screen.getByTestId('inventory-sort-name').closest('th')).toHaveAttribute('aria-sort', 'descending');
    expect(listed()).toEqual(['Water', 'Rice', 'Gas']);
  });

  it('narrows the list by status and by category from the boxes under the headings', async () => {
    await show();

    fireEvent.change(screen.getByTestId('inventory-filter-status'), { target: { value: 'low' } });
    expect(listed()).toEqual(['Water']);

    fireEvent.change(screen.getByTestId('inventory-filter-status'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('inventory-filter-category'), { target: { value: 'Dry' } });
    expect(listed()).toEqual(['Rice']);
  });

  it('offers only the categories on the list, plus "No category" when something has none', async () => {
    await show();

    const options = within(screen.getByTestId('inventory-filter-category')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['All', 'Drinks', 'Dry', 'No category']);
  });

  it('takes a number expression under On Hand, and says so when nothing is left', async () => {
    await show();

    fireEvent.change(screen.getByTestId('inventory-filter-on_hand'), { target: { value: '<10' } });
    expect(listed()).toEqual(['Gas']);

    fireEvent.change(screen.getByTestId('inventory-filter-on_hand'), { target: { value: '>1000' } });
    expect(screen.getByText('Nothing matches these filters.')).toBeInTheDocument();
    // The headings and boxes stay, so the filter can be taken off again.
    expect(screen.getByTestId('inventory-filter-on_hand')).toBeInTheDocument();
  });

  it('clears every box at once', async () => {
    await show();
    fireEvent.change(screen.getByTestId('inventory-filter-sku'), { target: { value: 'WTR' } });
    fireEvent.change(screen.getByTestId('inventory-filter-status'), { target: { value: 'low' } });
    expect(listed()).toEqual(['Water']);

    fireEvent.click(screen.getByTestId('inventory-clear-filters'));

    expect(listed()).toEqual(['Gas', 'Rice', 'Water']);
    expect(screen.getByTestId('inventory-filter-sku')).toHaveValue('');
  });
});
