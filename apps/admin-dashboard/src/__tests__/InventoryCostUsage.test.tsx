import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';

/*
 * Best price and total used, across brands and sizes.
 *
 * Owner, 2026-09-06: "same item has different brands and different sizes.
 * Sometime we buy different brands and different sizes. I need to know the
 * best price and total quantity of the product utilized even though different
 * brands and sizes."
 *
 * The panel's one job is to rank on price per base unit. A 500 ml tin at
 * MVR 95 next to a 100 ml tin at MVR 17 tells you nothing; 0.19 per ml next
 * to 0.17 per ml tells you the small tin is the cheaper ghee.
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
  quantity_on_hand: 700,
  reorder_level: 500,
  cost_per_unit: 0.18,
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
  purchase_units: [],
};

const costUsage = {
  item: { id: 21, name: 'Ghee', unit: 'ml', on_hand: 700, packs: [] },
  prices: [
    {
      brand: 'Milma', pack_name: '100 ml tin', pack_size: 100, supplier: 'Fahi Store',
      per_unit: 0.17, pack_price: 17, times: 1, total_qty: 600,
      last_bought: '2026-09-03', source: 'purchase' as const, is_cheapest: true,
    },
    {
      brand: 'Amul', pack_name: '500 ml tin', pack_size: 500, supplier: 'Fahi Store',
      per_unit: 0.19, pack_price: 95, times: 2, total_qty: 1000,
      last_bought: '2026-09-01', source: 'purchase' as const, is_cheapest: false,
    },
    {
      brand: 'Local', pack_name: null, pack_size: null, supplier: 'Corner Shop',
      per_unit: 0.22, pack_price: null, times: 1, total_qty: null,
      last_bought: '2026-08-28', source: 'buying_list' as const, is_cheapest: false,
    },
  ],
  usage: {
    window_days: 90, unit: 'ml', received: 1600, used: 900, written_off: 400,
    added_back: 0, on_hand: 700, spend: 292, average_price: 0.1825, value_used: 164.25,
  },
};

const getInventoryCostUsage = vi.fn();
const fetchInventoryItems = vi.fn();

vi.mock('../api', () => ({
  getInventoryCostUsage: (...a: unknown[]) => getInventoryCostUsage(...a),
  fetchInventoryItems: (...a: unknown[]) => fetchInventoryItems(...a),
  getInventoryPriceHistory: vi.fn().mockResolvedValue({ history: [] }),
  getInventoryCheapestSupplier: vi.fn().mockResolvedValue({ supplier: null }),
  getPurchaseUnits: vi.fn().mockResolvedValue({ base_unit: 'ml', purchase_units: [] }),
  createPurchaseUnit: vi.fn(),
  deletePurchaseUnit: vi.fn(),
  updateInventoryItem: vi.fn(),
  fetchLowStockItems: vi.fn().mockResolvedValue({ data: [] }),
  fetchInventoryCategories: vi.fn().mockResolvedValue({ categories: [] }),
  fetchSuppliers: vi.fn().mockResolvedValue({ data: [] }),
  getUnitConversions: vi.fn().mockResolvedValue({ conversions: [] }),
  fetchPreparedStock: vi.fn().mockResolvedValue({ rows: [] }),
  adjustInventoryStock: vi.fn(),
  createInventoryCategory: vi.fn(),
  updateInventoryCategory: vi.fn(),
  createUnitConversion: vi.fn(),
  deleteUnitConversion: vi.fn(),
  submitStockCount: vi.fn(),
  adjustPreparedStock: vi.fn(),
  createInventoryItem: vi.fn(),
  fetchInventoryItemDetail: vi.fn(),
}));

async function openPanel() {
  render(<MemoryRouter><InventoryPage /></MemoryRouter>);
  fireEvent.click(await screen.findByTitle('Price history'));
  return await screen.findByTestId('cost-usage-prices');
}

describe('Cost & usage panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInventoryCostUsage.mockResolvedValue(costUsage);
    fetchInventoryItems.mockResolvedValue({
      data: [ghee], meta: { current_page: 1, last_page: 1, total: 1 },
    });
  });

  it('ranks the small tin above the big one on price per ml', async () => {
    const table = await openPanel();
    const rows = within(table).getAllByRole('row').slice(1);

    expect(rows[0].textContent).toContain('Milma');
    expect(rows[0].textContent).toContain('0.1700');
    expect(rows[1].textContent).toContain('Amul');
    expect(rows[1].textContent).toContain('0.1900');
  });

  it('marks the cheapest row rather than leaving it to be spotted', async () => {
    await openPanel();

    expect(screen.getByTestId('cost-usage-cheapest').textContent).toContain('Milma');
  });

  it('still names the price of a whole tin, so the row is recognisable', async () => {
    const table = await openPanel();

    expect(table.textContent).toContain('MVR 17.00');
    expect(table.textContent).toContain('MVR 95.00');
    expect(table.textContent).toContain('100 ml tin (100 ml)');
  });

  it('says a shop-run price has no pack instead of inventing one', async () => {
    const table = await openPanel();
    const local = within(table).getAllByRole('row').find((r) => r.textContent?.includes('Local'));

    expect(local?.textContent).toContain('Shop run');
    // No made-up pack price beside a real one: the pack column is a dash.
    const cells = within(local!).getAllByRole('cell');
    expect(cells[4].textContent).toBe('—');
  });

  it('totals what was bought, used and thrown away', async () => {
    await openPanel();
    const totals = screen.getByTestId('cost-usage-totals');

    expect(totals.textContent).toContain('1600 ml');
    expect(totals.textContent).toContain('900 ml');
    expect(totals.textContent).toContain('400 ml');
    expect(totals.textContent).toContain('MVR 292.00');
    expect(totals.textContent).toContain('MVR 0.1825');
  });

  it('reloads on a different window rather than filtering what it has', async () => {
    // A 30-day answer is a different question, not a subset of the rows the
    // 90-day one returned — the server has to be asked again.
    await openPanel();
    fireEvent.click(screen.getByText('30 days'));

    await waitFor(() => expect(getInventoryCostUsage).toHaveBeenCalledWith(21, 30));
  });

  it('asks for all time when All time is chosen', async () => {
    await openPanel();
    fireEvent.click(screen.getByText('All time'));

    await waitFor(() => expect(getInventoryCostUsage).toHaveBeenCalledWith(21, 0));
  });

  it('says nothing was bought rather than showing an empty table', async () => {
    getInventoryCostUsage.mockResolvedValue({
      ...costUsage,
      prices: [],
      usage: { ...costUsage.usage, received: 0, used: 0, spend: 0, average_price: null, value_used: null },
    });
    render(<MemoryRouter><InventoryPage /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Price history'));

    expect(await screen.findByText('Nothing bought in this window.')).toBeInTheDocument();
    // An unknown average is not a claim that it was free.
    expect(screen.getByTestId('cost-usage-totals').textContent).toContain('Not known');
  });
});
