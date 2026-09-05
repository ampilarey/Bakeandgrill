import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';

/*
 * Editing an inventory item.
 *
 * Owner, 2026-09-05: "make items editable". Everything about a SKU was fixed
 * at creation — a typo in the name, or a unit set to kg when the thing is
 * counted in pieces, meant abandoning the item and building another one. The
 * unit especially, since a purchase priced by the case divides into whatever
 * the item says it is counted in.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));

const eggs = {
  id: 12,
  name: 'Egg',
  sku: 'EGG-1',
  barcode: null,
  unit: 'kg',
  quantity_on_hand: 40,
  reorder_level: 10,
  cost_per_unit: 2,
  category: { id: 3, name: 'Dry store' },
  is_active: true,
  requestable: true,
  last_counted_at: null,
  created_at: '2026-01-01T00:00:00Z',
  lead_days: 3,
  cover_days: 14,
  storage_location: 'Cold room',
  notes: null,
  preferred_supplier_id: null,
};

const updateInventoryItem = vi.fn();
// Hoisted above the fixture, so the rows are supplied in beforeEach.
const fetchInventoryItems = vi.fn();
vi.mock('../api', () => ({
  updateInventoryItem: (...a: unknown[]) => updateInventoryItem(...a),
  fetchInventoryItems: (...a: unknown[]) => fetchInventoryItems(...a),
  fetchLowStockItems: vi.fn().mockResolvedValue({ data: [] }),
  fetchInventoryCategories: vi.fn().mockResolvedValue({ categories: [{ id: 3, name: 'Dry store' }] }),
  fetchSuppliers: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Island Wholesale' }] }),
  getUnitConversions: vi.fn().mockResolvedValue({ conversions: [] }),
  fetchPreparedStock: vi.fn().mockResolvedValue({ rows: [] }),
  getPurchaseUnits: vi.fn().mockResolvedValue({ base_unit: 'kg', purchase_units: [] }),
  createPurchaseUnit: vi.fn(),
  deletePurchaseUnit: vi.fn(),
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

async function openEditor() {
  render(<MemoryRouter><InventoryPage /></MemoryRouter>);
  fireEvent.click(await screen.findByTitle('Edit this item'));
  return await screen.findByLabelText('Item name');
}

describe('Inventory item editing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateInventoryItem.mockResolvedValue({ item: eggs });
    fetchInventoryItems.mockResolvedValue({ data: [eggs], meta: { current_page: 1, last_page: 1, total: 1 } });
  });

  it('opens with the item already filled in', async () => {
    const name = await openEditor();

    expect(name).toHaveValue('Egg');
    expect(screen.getByLabelText('Item unit')).toHaveValue('kg');
    expect(screen.getByLabelText('SKU')).toHaveValue('EGG-1');
    expect(screen.getByLabelText('Reorder point')).toHaveValue(10);
    expect(screen.getByLabelText('Storage location')).toHaveValue('Cold room');
  });

  it('saves the fields that were changed', async () => {
    await openEditor();

    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Eggs, large' } });
    fireEvent.change(screen.getByLabelText('Reorder point'), { target: { value: '24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateInventoryItem).toHaveBeenCalledWith(12, expect.objectContaining({
      name: 'Eggs, large',
      unit: 'kg',
      reorder_point: 24,
    })));
  });

  it('warns that changing the unit relabels the stock rather than converting it', async () => {
    // 40 kg becoming 40 piece is a count that now means something else, and
    // the pack maths divides by whatever the item says it is counted in.
    await openEditor();

    expect(screen.queryByText(/does not convert it/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Item unit'), { target: { value: 'piece' } });

    expect(await screen.findByText(/40 kg on hand/)).toBeInTheDocument();
    expect(screen.getByText(/does not convert it/)).toBeInTheDocument();
  });

  it('still lets the unit be corrected, since that is usually the point', async () => {
    await openEditor();
    fireEvent.change(screen.getByLabelText('Item unit'), { target: { value: 'piece' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateInventoryItem).toHaveBeenCalledWith(12, expect.objectContaining({ unit: 'piece' })));
  });

  it('refuses to save an item with no name or no unit', async () => {
    await openEditor();

    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Name is required.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Egg' } });
    fireEvent.change(screen.getByLabelText('Item unit'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Unit is required/)).toBeInTheDocument();

    expect(updateInventoryItem).not.toHaveBeenCalled();
  });

  it('does not offer stock on hand or unit cost, which belong to other trails', async () => {
    // Stock moves through Adjust Stock so every change is recorded; unit cost
    // is the weighted average the purchases built.
    await openEditor();

    expect(screen.queryByLabelText('Opening stock')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Unit cost (MVR)')).not.toBeInTheDocument();
    expect(screen.getByText(/Stock on hand is changed through Adjust Stock/)).toBeInTheDocument();
  });
});
