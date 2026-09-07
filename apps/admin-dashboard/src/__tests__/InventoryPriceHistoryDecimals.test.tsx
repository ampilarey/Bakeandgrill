import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';

/*
 * Owner, 2026-09-07, on a phone, after entering the first purchases:
 * "Something went wrong — t.unit_cost.toFixed is not a function."
 *
 * MySQL hands DECIMAL columns back as strings, and Eloquent's `decimal:`
 * cast keeps them that way, so purchase_items.unit_cost reached the admin as
 * "1.976190". The type said `number`, so nothing complained until the modal
 * called .toFixed on it and took the whole page down with it — and only once
 * an item actually had some buying history behind it.
 *
 * Fixed at the source (the endpoint now sends floats) and here, through the
 * formatter this project already keeps for exactly this: utils/fmt, whose
 * docblock has said "always parse before calling toFixed()" all along.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));
vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
  useIsCompactAdmin: () => false,
  useIsWideDesktop: () => true,
}));

const rice = {
  id: 4,
  name: 'Rice',
  sku: 'RICE-1',
  barcode: null,
  unit: 'kg',
  quantity_on_hand: 10,
  reorder_level: 2,
  cost_per_unit: 20,
  category: null,
  is_active: true,
  requestable: true,
  last_counted_at: null,
  created_at: '2026-01-01T00:00:00Z',
  lead_days: null,
  cover_days: null,
  storage_location: null,
  notes: null,
  preferred_supplier_id: null,
};

const getInventoryPriceHistory = vi.fn();
const fetchInventoryItems = vi.fn();

vi.mock('../api', () => ({
  fetchInventoryItems: (...a: unknown[]) => fetchInventoryItems(...a),
  getInventoryPriceHistory: (...a: unknown[]) => getInventoryPriceHistory(...a),
  getInventoryCheapestSupplier: vi.fn().mockResolvedValue({ supplier: null }),
  // Loaded in the same Promise.all as the history; without it the whole
  // panel rejects and shows nothing at all.
  getInventoryCostUsage: vi.fn().mockResolvedValue({
    item: { id: 4, name: 'Rice', unit: 'kg', on_hand: 10, packs: [] },
    prices: [],
    usage: {
      window_days: 90, unit: 'kg', received: 0, used: 0, written_off: 0,
      added_back: 0, on_hand: 10, spend: 0, average_price: null, value_used: null,
    },
  }),
  adjustInventoryStock: vi.fn(),
  fetchLowStockItems: vi.fn().mockResolvedValue({ data: [] }),
  fetchInventoryCategories: vi.fn().mockResolvedValue({ categories: [] }),
  fetchSuppliers: vi.fn().mockResolvedValue({ data: [] }),
  getUnitConversions: vi.fn().mockResolvedValue({ conversions: [] }),
  fetchPreparedStock: vi.fn().mockResolvedValue({ rows: [] }),
  getPurchaseUnits: vi.fn().mockResolvedValue({ base_unit: 'kg', purchase_units: [] }),
  createPurchaseUnit: vi.fn(),
  deletePurchaseUnit: vi.fn(),
  updatePurchaseUnit: vi.fn(),
  updateInventoryItem: vi.fn(),
  createInventoryCategory: vi.fn(),
  updateInventoryCategory: vi.fn(),
  createUnitConversion: vi.fn(),
  deleteUnitConversion: vi.fn(),
  submitStockCount: vi.fn(),
  adjustPreparedStock: vi.fn(),
  createInventoryItem: vi.fn(),
  fetchInventoryItemDetail: vi.fn(),
  packNameConflict: () => null,
}));

describe('Price history when the server sends decimals as strings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchInventoryItems.mockResolvedValue({ data: [rice], meta: { current_page: 1, last_page: 1, total: 1 } });
  });

  it('renders the price instead of taking the page down', async () => {
    // Exactly what a `decimal:` cast puts on the wire.
    getInventoryPriceHistory.mockResolvedValue({
      history: [{
        purchase_id: 1,
        purchase_number: 'PO-0001',
        supplier: 'Fahi Store',
        unit_cost: '1.976190' as unknown as number,
        quantity: '2.0000' as unknown as number,
        purchase_date: '2026-09-06',
      }],
    });

    render(<MemoryRouter><InventoryPage /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Price history'));

    expect(await screen.findByText('MVR 1.98')).toBeInTheDocument();
    expect(screen.getByText('Fahi Store')).toBeInTheDocument();
  });

  it('handles a real number just the same', async () => {
    getInventoryPriceHistory.mockResolvedValue({
      history: [{
        purchase_id: 1, purchase_number: 'PO-0002', supplier: 'Fahi Store',
        unit_cost: 2.5, quantity: 3, purchase_date: '2026-09-06',
      }],
    });

    render(<MemoryRouter><InventoryPage /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Price history'));

    expect(await screen.findByText('MVR 2.50')).toBeInTheDocument();
  });

  it('does not fall over on a missing price', async () => {
    getInventoryPriceHistory.mockResolvedValue({
      history: [{
        purchase_id: null, purchase_number: null, supplier: null,
        unit_cost: null as unknown as number, quantity: 1, purchase_date: null,
      }],
    });

    render(<MemoryRouter><InventoryPage /></MemoryRouter>);
    fireEvent.click(await screen.findByTitle('Price history'));

    // The usage panel shows MVR 0.00 too; what matters is that the row
    // rendered at all rather than taking the page down.
    expect((await screen.findAllByText('MVR 0.00')).length).toBeGreaterThan(0);
  });
});
