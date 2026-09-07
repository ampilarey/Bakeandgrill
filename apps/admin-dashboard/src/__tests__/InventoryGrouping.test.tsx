import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';

/*
 * Owner, 2026-09-07: "add grouping based on groups".
 *
 * Sorting by category already put like with like, but the list ran on with
 * nothing to say where one group ended and the next began. The same request
 * asked for the option to add an item here, which was already on the page
 * behind the label "+ Add SKU" — jargon for the one word the owner used.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));

let mobile = false;
vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => mobile,
  useIsCompactAdmin: () => false,
  useIsWideDesktop: () => !mobile,
}));

const stockItem = (id: number, name: string, category: { id: number; name: string } | null) => ({
  id,
  name,
  sku: `SKU-${id}`,
  barcode: null,
  unit: 'kg',
  quantity_on_hand: 5,
  reorder_level: 1,
  cost_per_unit: 10,
  category,
  is_active: true,
  requestable: true,
  last_counted_at: null,
  created_at: '2026-01-01T00:00:00Z',
  lead_days: null,
  cover_days: null,
  storage_location: null,
  notes: null,
  preferred_supplier_id: null,
});

const DRY = { id: 1, name: 'Dry store' };
const CHILLED = { id: 2, name: 'Chilled' };

const rows = [
  stockItem(1, 'Flour', DRY),
  stockItem(2, 'Milk', CHILLED),
  stockItem(3, 'Sugar', DRY),
  stockItem(4, 'Mystery box', null),
];

const fetchInventoryItems = vi.fn();

vi.mock('../api', () => ({
  fetchInventoryItems: (...a: unknown[]) => fetchInventoryItems(...a),
  adjustInventoryStock: vi.fn(),
  fetchLowStockItems: vi.fn().mockResolvedValue({ data: [] }),
  // Inlined: a vi.mock factory is hoisted above the consts above it.
  fetchInventoryCategories: vi.fn().mockResolvedValue({ categories: [{ id: 1, name: 'Dry store' }, { id: 2, name: 'Chilled' }] }),
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

/**
 * The group headings, in the order they are drawn. Whitespace squeezed out:
 * the table draws "Chilled(1)" and the cards "Chilled (1)", and the gap
 * between a word and its count is not what these tests are about.
 */
function headings() {
  return screen.queryAllByTestId(/^inventory-group-heading-/)
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ''));
}

describe('Grouping the stock list by category', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mobile = false;
    localStorage.clear();
    fetchInventoryItems.mockResolvedValue({ data: rows, meta: { current_page: 1, last_page: 1, total: rows.length } });
  });

  it('is off until asked for, so the flat list is what loads', async () => {
    renderPage();
    await screen.findByText('Flour');

    expect(headings()).toEqual([]);
  });

  it('puts each category over its own items, unfiled ones last', async () => {
    renderPage();
    await screen.findByText('Flour');

    fireEvent.click(screen.getByTestId('inventory-group-toggle'));

    expect(headings()).toEqual(['Chilled(1)', 'Drystore(2)', 'Nocategory(1)']);
    // Every item is still on the page, under a heading rather than adrift.
    ['Flour', 'Milk', 'Sugar', 'Mystery box'].forEach((name) => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
  });

  it('groups the cards on a phone too', async () => {
    mobile = true;
    renderPage();
    await screen.findByTestId('inventory-card-1');

    fireEvent.click(screen.getByTestId('inventory-group-toggle'));

    expect(headings()).toEqual(['Chilled(1)', 'Drystore(2)', 'Nocategory(1)']);
    expect(screen.getByTestId('inventory-card-4')).toBeInTheDocument();
  });

  it('remembers the choice for next time', async () => {
    const first = renderPage();
    await screen.findByText('Flour');
    fireEvent.click(screen.getByTestId('inventory-group-toggle'));
    first.unmount();

    renderPage();
    await screen.findByText('Flour');
    expect(screen.getByTestId('inventory-group-toggle')).toBeChecked();
    expect(headings()).toHaveLength(3);
  });

  it('offers adding an item in the owner\'s own word, not "SKU"', async () => {
    renderPage();
    await screen.findByText('Flour');

    expect(screen.getByText('+ Add Item')).toBeInTheDocument();
    expect(screen.queryByText('+ Add SKU')).toBeNull();

    fireEvent.click(screen.getByText('+ Add Item'));
    const dialog = await screen.findByRole('dialog');
    // The full form, not the two-field quick-add on a purchase order.
    expect(within(dialog).getByLabelText('New item category')).toBeInTheDocument();
  });
});
