import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';

/*
 * Pack sizes, where somebody can find them.
 *
 * Owner, 2026-09-06: "i dont see pack size" — asking how to handle ghee that
 * comes in 100 ml and 500 ml tins. The feature was built on 5 September and
 * then hidden behind an unlabelled 📦 among five other emoji buttons on the
 * row, so an item with packs looked exactly like one without and nobody knew
 * the thing existed.
 *
 * It is a named section of Edit item now, and every row says what it buys as.
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
  purchase_units: [
    { id: 7, name: '500 ml tin', base_units: 500 },
    { id: 6, name: '100 ml tin', base_units: 100 },
  ],
};

const looseSalt = { ...ghee, id: 22, name: 'Salt', sku: 'SALT-1', unit: 'kg', quantity_on_hand: 8, purchase_units: [] };

/*
 * Owner, 2026-09-06: "water, 5 bottles per day … known by sale and quantity
 * bought, each day." The list says the rate and roughly when it runs out.
 */
const water = {
  ...ghee, id: 23, name: 'Water', sku: 'WTR-1', unit: 'bottle', quantity_on_hand: 15,
  purchase_units: [],
  usage_per_day: 5, bought_per_day: 4.5, usage_source: 'used', days_left: 3,
};
const gas = {
  ...ghee, id: 24, name: 'Gas cylinder', sku: 'GAS-1', unit: 'piece', quantity_on_hand: 2,
  purchase_units: [],
  usage_per_day: 0, bought_per_day: 0.1, usage_source: 'bought', days_left: 20,
};

const getPurchaseUnits = vi.fn();
const createPurchaseUnit = vi.fn();
const deletePurchaseUnit = vi.fn();
const fetchInventoryItems = vi.fn();

vi.mock('../api', () => ({
  getPurchaseUnits: (...a: unknown[]) => getPurchaseUnits(...a),
  createPurchaseUnit: (...a: unknown[]) => createPurchaseUnit(...a),
  deletePurchaseUnit: (...a: unknown[]) => deletePurchaseUnit(...a),
  fetchInventoryItems: (...a: unknown[]) => fetchInventoryItems(...a),
  updateInventoryItem: vi.fn(),
  fetchLowStockItems: vi.fn().mockResolvedValue({ data: [] }),
  fetchInventoryCategories: vi.fn().mockResolvedValue({ categories: [{ id: 3, name: 'Dry store' }] }),
  fetchSuppliers: vi.fn().mockResolvedValue({ data: [] }),
  getUnitConversions: vi.fn().mockResolvedValue({ conversions: [] }),
  fetchPreparedStock: vi.fn().mockResolvedValue({ rows: [] }),
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
  fetchInventoryItemDetail: vi.fn(),
}));

function renderPage() {
  render(<MemoryRouter><InventoryPage /></MemoryRouter>);
}

async function openEditor(title = 'Edit this item') {
  renderPage();
  const buttons = await screen.findAllByTitle(title);
  fireEvent.click(buttons[0]);
  return await screen.findByTestId('pack-sizes-section');
}

describe('Pack sizes on the inventory list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'ml',
      purchase_units: [
        { id: 6, name: '100 ml tin', base_units: 100 },
        { id: 7, name: '500 ml tin', base_units: 500 },
      ],
    });
    fetchInventoryItems.mockResolvedValue({
      data: [ghee, looseSalt],
      meta: { current_page: 1, last_page: 1, total: 2 },
    });
  });

  it('offers the same sort on the desk and the phone, and both obey it', async () => {
    // Owner, 2026-09-07: "Add inventory sort option in both desktop and
    // mobile view." One control; the order it produces must match.
    fetchInventoryItems.mockResolvedValue({
      data: [water, gas],
      meta: { current_page: 1, last_page: 1, total: 2 },
      units: [],
    });
    renderPage();
    const sort = await screen.findByLabelText('Sort items');

    // Default: alphabetical — Gas cylinder before Water.
    let rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Gas cylinder');

    fireEvent.change(sort, { target: { value: 'days_left' } });
    rows = screen.getAllByRole('row').slice(1);
    // Water runs out in 3 days, gas in 20.
    expect(rows[0]).toHaveTextContent('Water');
    expect(localStorage.getItem('bg_inventory_sort')).toBe('days_left');
  });

  it('says how fast an item goes, and when it runs out', async () => {
    fetchInventoryItems.mockResolvedValue({
      data: [water, gas],
      meta: { current_page: 1, last_page: 1, total: 2 },
      units: [],
    });
    renderPage();

    expect(await screen.findByText('~5 /day')).toBeInTheDocument();
    expect(screen.getByText(/≈ 3 days left/)).toBeInTheDocument();
    // An untracked item stands on its buying rate, and says so.
    expect(screen.getByText('~0.1 /day')).toBeInTheDocument();
    expect(screen.getByText(/≈ 20 days left · from buying/)).toBeInTheDocument();
  });

  it('says what an item buys as, without opening anything', async () => {
    renderPage();

    // Smallest first, so it reads up from the loose unit.
    expect(await screen.findByText(/Buys as 100 ml tin \(100 ml\) · 500 ml tin \(500 ml\)/)).toBeInTheDocument();
  });

  it('reads the stock back in whole tins', async () => {
    // 2500 ml is five 500 ml tins — the number somebody at the shelf counts.
    renderPage();

    expect(await screen.findByText('5 × 500 ml tin')).toBeInTheDocument();
  });

  it('claims no tins when the stock does not divide into whole ones', async () => {
    // 2300 ml is 4.6 tins, which is not a thing anybody has on a shelf.
    fetchInventoryItems.mockResolvedValue({
      data: [{ ...ghee, quantity_on_hand: 2300 }],
      meta: { current_page: 1, last_page: 1, total: 1 },
    });
    renderPage();

    await screen.findByText(/Buys as/);
    expect(screen.queryByText(/× 500 ml tin/)).toBeNull();
  });

  it('says nothing at all for an item bought loose', async () => {
    renderPage();

    const rows = await screen.findAllByText('Salt');
    expect(rows[0].closest('td')?.textContent).not.toMatch(/Buys as/);
  });
});

describe('Pack sizes inside Edit item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'ml',
      purchase_units: [{ id: 7, name: '500 ml tin', base_units: 500 }],
    });
    fetchInventoryItems.mockResolvedValue({
      data: [ghee],
      meta: { current_page: 1, last_page: 1, total: 1 },
    });
  });

  it('is a named section, not an emoji nobody finds', async () => {
    const section = await openEditor();

    expect(within(section).getByText(/Pack sizes — how you buy this/)).toBeInTheDocument();
    // The unit it is measured against, said out loud.
    expect(section.textContent).toMatch(/Stock is counted in\s*ml/);
  });

  it("loads the item's packs when the editor opens", async () => {
    const section = await openEditor();

    await waitFor(() => expect(getPurchaseUnits).toHaveBeenCalledWith(21));
    expect(await within(section).findByTestId('pack-row-7')).toHaveTextContent('500 ml tin');
    expect(within(section).getByTestId('pack-row-7')).toHaveTextContent('500 ml');
  });

  it('adds a second tin size from inside the editor', async () => {
    createPurchaseUnit.mockResolvedValue({ purchase_unit: { id: 6, name: '100 ml tin', base_units: 100 } });
    const section = await openEditor();
    await within(section).findByTestId('pack-row-7');

    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: '100 ml tin' } });
    fireEvent.change(screen.getByLabelText('Amount in the pack'), { target: { value: '100' } });
    fireEvent.click(screen.getByText('Add pack'));

    await waitFor(() => expect(createPurchaseUnit).toHaveBeenCalledWith(21, {
      name: '100 ml tin',
      base_units: 100,
    }));
  });

  it('refuses a pack with no amount rather than storing a zero', async () => {
    const section = await openEditor();
    await within(section).findByTestId('pack-row-7');

    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: 'Carton' } });
    fireEvent.click(screen.getByText('Add pack'));

    expect(await screen.findByText('Say how much is in it.')).toBeInTheDocument();
    expect(createPurchaseUnit).not.toHaveBeenCalled();
  });

  it('reloads the list after a pack changes, so the row catches up', async () => {
    createPurchaseUnit.mockResolvedValue({ purchase_unit: { id: 6, name: '100 ml tin', base_units: 100 } });
    const section = await openEditor();
    await within(section).findByTestId('pack-row-7');
    const before = fetchInventoryItems.mock.calls.length;

    fireEvent.change(screen.getByLabelText('Pack name'), { target: { value: '100 ml tin' } });
    fireEvent.change(screen.getByLabelText('Amount in the pack'), { target: { value: '100' } });
    fireEvent.click(screen.getByText('Add pack'));

    await waitFor(() => expect(fetchInventoryItems.mock.calls.length).toBeGreaterThan(before));
  });
});
