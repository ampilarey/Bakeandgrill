import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';

/*
 * Inventory on a phone.
 *
 * The stock tab is a seven-column table whose last cell holds six buttons and
 * a stepper. On a phone that is a sideways scroll to reach the number you came
 * for, and thumb-sized targets drawn at 28px. Same rows, drawn as cards.
 *
 * What these tests actually guard is that nothing is *lost* in the narrow
 * layout: every action on the desktop row is on the card too. A mobile view
 * that quietly drops the edit button is worse than a table you have to scroll.
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
  quantity_on_hand: 3,
  reorder_level: 10,
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
}));

function renderPage() {
  return render(<MemoryRouter><InventoryPage /></MemoryRouter>);
}

describe('Inventory on a phone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mobile = true;
    fetchInventoryItems.mockResolvedValue({ data: [rice], meta: { current_page: 1, last_page: 1, total: 1 } });
  });

  it('draws cards instead of the sideways-scrolling table', async () => {
    renderPage();

    expect(await screen.findByTestId('inventory-card-4')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // The identifying detail is still there, just not as its own column.
    expect(screen.getByText('RICE-1 · Dry store')).toBeInTheDocument();
  });

  it('keeps the table on a wide screen', async () => {
    mobile = false;
    renderPage();

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByTestId('inventory-card-4')).not.toBeInTheDocument();
  });

  it('carries every action from the desktop row onto the card', async () => {
    // A narrow layout that quietly drops the edit button is the failure mode
    // worth guarding: the whole point is the same job on a smaller screen.
    renderPage();
    const card = await screen.findByTestId('inventory-card-4');

    for (const title of [
      'Full adjust dialog',
      'Edit this item',
      'Stock movements',
      'Price history',
      'Pack sizes — how you buy this',
    ]) {
      expect(card.querySelector(`[title="${title}"]`)).not.toBeNull();
    }
  });

  it('adjusts stock from the card, with labelled buttons a thumb can hit', async () => {
    renderPage();
    await screen.findByTestId('inventory-card-4');

    fireEvent.click(screen.getByLabelText('Add one Rice'));
    await waitFor(() => expect(adjustInventoryStock).not.toHaveBeenCalled());
    // The stepper debounces, so the call lands after the pause rather than
    // firing once per tap — the same behaviour the table row has.
    await waitFor(
      () => expect(adjustInventoryStock).toHaveBeenCalledWith(4, { delta: 1, notes: 'Quick adjust' }),
      { timeout: 2000 },
    );
  });

  it('marks a low item without needing a status column', async () => {
    renderPage();
    const card = await screen.findByTestId('inventory-card-4');

    // 3 on hand against a reorder level of 10.
    expect(card).toHaveTextContent('Low');
    expect(card).toHaveTextContent('reorder at 10');
  });
});
