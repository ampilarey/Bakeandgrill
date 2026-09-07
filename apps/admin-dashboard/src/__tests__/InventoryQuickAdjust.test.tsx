import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';

/*
 * The ± on a stock row. Owner, 2026-09-07: "when i click + or - every time
 * page reloads."
 *
 * Three things made one tap feel like a reload:
 *
 *   - both buttons disabled themselves the moment you tapped and stayed
 *     disabled until the save returned, so the 800ms batching window could
 *     never batch anything — every tap was its own round trip;
 *   - the count was replaced by "…", so there was nothing to watch;
 *   - the reconcile afterwards flipped the page into its loading skeleton and
 *     re-walked every page of the inventory, tearing the list down and
 *     putting the phone back at the top.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));

let mobile = true;
vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => mobile,
  useIsCompactAdmin: () => false,
  useIsWideDesktop: () => !mobile,
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
  category: { id: 1, name: 'Dry store' },
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

const adjustInventoryStock = vi.fn();
const fetchInventoryItems = vi.fn();

vi.mock('../api', () => ({
  adjustInventoryStock: (...a: unknown[]) => adjustInventoryStock(...a),
  fetchInventoryItems: (...a: unknown[]) => fetchInventoryItems(...a),
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
  getInventoryPriceHistory: vi.fn(),
  getInventoryCheapestSupplier: vi.fn(),
  submitStockCount: vi.fn(),
  adjustPreparedStock: vi.fn(),
  createInventoryItem: vi.fn(),
  fetchInventoryItemDetail: vi.fn(),
  packNameConflict: () => null,
}));

const count = () => screen.getByTestId('stock-count-4');
const plus = () => screen.getByLabelText('Add one Rice');
const minus = () => screen.getByLabelText('Remove one Rice');

describe('The ± on a stock row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mobile = true;
    fetchInventoryItems.mockResolvedValue({ data: [rice], meta: { current_page: 1, last_page: 1, total: 1 } });
    adjustInventoryStock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function openList() {
    render(<MemoryRouter><InventoryPage /></MemoryRouter>);
    await screen.findByTestId('inventory-card-4');
  }

  it('counts up as fast as you can tap, and saves the total once', async () => {
    await openList();

    fireEvent.click(plus());
    expect(count()).toHaveTextContent('11');
    // The button that was just tapped is still there to tap again — this is
    // what the batching window is for.
    expect(plus()).toBeEnabled();

    fireEvent.click(plus());
    fireEvent.click(plus());
    expect(count()).toHaveTextContent('13');

    await vi.advanceTimersByTimeAsync(900);

    await waitFor(() => expect(adjustInventoryStock).toHaveBeenCalledTimes(1));
    expect(adjustInventoryStock).toHaveBeenCalledWith(4, { delta: 3, notes: 'Quick adjust' });
  });

  it('never blanks the number while it saves', async () => {
    await openList();

    // The server agrees once the save lands, the way a real one would.
    adjustInventoryStock.mockImplementation(() => {
      fetchInventoryItems.mockResolvedValue({
        data: [{ ...rice, quantity_on_hand: 11 }], meta: { current_page: 1, last_page: 1, total: 1 },
      });
      return Promise.resolve({});
    });

    fireEvent.click(plus());
    // Dimmed to say a save is coming, but the figure is the one that counts.
    expect(count()).toHaveTextContent('11');
    expect(count()).not.toHaveTextContent('…');

    await vi.advanceTimersByTimeAsync(900);
    // And it stays put across the reconcile — no flicker back to the old
    // number, no blank while the request is in the air.
    await waitFor(() => expect(adjustInventoryStock).toHaveBeenCalled());
    expect(count()).toHaveTextContent('11');
  });

  it('refreshes without tearing the list down', async () => {
    await openList();

    fireEvent.click(plus());
    await vi.advanceTimersByTimeAsync(900);

    // The reconcile happens, and the row it is reconciling never leaves the
    // page — no skeleton, no scroll back to the top.
    await waitFor(() => expect(fetchInventoryItems).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('inventory-card-4')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('still refuses to take stock below nothing', async () => {
    fetchInventoryItems.mockResolvedValue({
      data: [{ ...rice, quantity_on_hand: 0 }], meta: { current_page: 1, last_page: 1, total: 1 },
    });
    await openList();

    expect(minus()).toBeDisabled();
    expect(plus()).toBeEnabled();
  });

  it('sends one net movement when taps cancel out', async () => {
    await openList();

    fireEvent.click(plus());
    fireEvent.click(minus());
    expect(count()).toHaveTextContent('10');

    await vi.advanceTimersByTimeAsync(900);

    // Nothing moved, so nothing is sent.
    expect(adjustInventoryStock).not.toHaveBeenCalled();
  });
});
