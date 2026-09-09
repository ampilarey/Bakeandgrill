import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';

/*
 * Owner, 2026-09-09: "how to del an item in inventory."
 *
 * There was no way at all — no button, no endpoint. There are two answers and
 * they are not interchangeable:
 *
 *   Archive is for an item you have stopped buying. Every purchase, count and
 *   report it appears in stays exactly as it is.
 *
 *   Delete is for an item that never happened. The server refuses anything
 *   else, because those rows are the purchase history and the cost of goods,
 *   and this screen has to say so rather than let a 409 read as a bug.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));
vi.mock('../api/operations', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/operations')>(),
  getBrandPhotos: vi.fn().mockResolvedValue({ item_id: 21, photos: [] }),
  uploadBrandPhoto: vi.fn(),
  deleteBrandPhoto: vi.fn(),
}));

const turmeric = {
  id: 31,
  name: 'Turmeric Powder',
  sku: 'TUR-1',
  barcode: null,
  unit: 'g',
  quantity_on_hand: 0,
  reorder_level: null,
  cost_per_unit: 0,
  category: null,
  is_active: true,
  requestable: true,
  last_counted_at: null,
  created_at: '2026-09-09T00:00:00Z',
  lead_days: null,
  cover_days: null,
  storage_location: null,
  notes: null,
  preferred_supplier_id: null,
  purchase_units: [],
};

const deleteInventoryItem = vi.fn();
const createInventoryItem = vi.fn();
const updateInventoryItem = vi.fn().mockResolvedValue({ item: {} });
const fetchInventoryItems = vi.fn();

vi.mock('../api', () => ({
  fetchInventoryItems: (...a: unknown[]) => fetchInventoryItems(...a),
  deleteInventoryItem: (...a: unknown[]) => deleteInventoryItem(...a),
  updateInventoryItem: (...a: unknown[]) => updateInventoryItem(...a),
  getPurchaseUnits: vi.fn().mockResolvedValue({ base_unit: 'g', purchase_units: [], brands: [] }),
  createPurchaseUnit: vi.fn(),
  updatePurchaseUnit: vi.fn(),
  deletePurchaseUnit: vi.fn(),
  packNameConflict: vi.fn().mockReturnValue(null),
  // The real shape check: the page has to read the 409 body, not a message.
  itemNameConflict: (e: unknown) => {
    const body = (e as { body?: { conflict?: string } } | null)?.body;
    return body?.conflict === 'inventory_item_name_in_use' ? body : null;
  },
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
  getInventoryPriceHistory: vi.fn(),
  getInventoryCheapestSupplier: vi.fn(),
  getInventoryCostUsage: vi.fn(),
  submitStockCount: vi.fn(),
  adjustPreparedStock: vi.fn(),
  createInventoryItem: (...a: unknown[]) => createInventoryItem(...a),
  createSupplier: vi.fn(),
  fetchInventoryItemDetail: vi.fn(),
}));

function renderPage() {
  render(<MemoryRouter><InventoryPage /></MemoryRouter>);
}

async function openEdit(item = turmeric) {
  fetchInventoryItems.mockResolvedValue({
    data: [item], meta: { current_page: 1, last_page: 1, total: 1 }, units: ['g'],
  });
  renderPage();
  fireEvent.click((await screen.findAllByTitle('Edit this item'))[0]);
  return await screen.findByTestId('item-retire');
}

describe('Retiring an inventory item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteInventoryItem.mockResolvedValue({ deleted: true });
    updateInventoryItem.mockResolvedValue({ item: {} });
  });

  it('offers both answers, and says which is which', async () => {
    const box = await openEdit();

    expect(within(box).getByText(/Archive it/)).toBeInTheDocument();
    // The one sentence somebody needs before pressing the red button.
    expect(box.textContent).toMatch(/only for an item nothing has touched/);
    expect(within(box).getByTestId('item-delete')).toBeInTheDocument();
  });

  it('archives through the ordinary save, keeping the item', async () => {
    await openEdit();

    fireEvent.click(screen.getByTestId('item-archived'));
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => expect(updateInventoryItem).toHaveBeenCalledWith(
      31, expect.objectContaining({ is_active: false }),
    ));
    expect(deleteInventoryItem).not.toHaveBeenCalled();
  });

  it('brings an archived item back', async () => {
    await openEdit({ ...turmeric, is_active: false });

    // Opens ticked, because the item is archived.
    expect(screen.getByTestId('item-archived')).toBeChecked();
    fireEvent.click(screen.getByTestId('item-archived'));
    fireEvent.click(screen.getByText('Save changes'));

    await waitFor(() => expect(updateInventoryItem).toHaveBeenCalledWith(
      31, expect.objectContaining({ is_active: true }),
    ));
  });

  it('asks before deleting, and does nothing if the answer is no', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await openEdit();

    fireEvent.click(screen.getByTestId('item-delete'));

    expect(confirm).toHaveBeenCalled();
    expect(deleteInventoryItem).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('deletes an item nothing has touched', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await openEdit();

    fireEvent.click(screen.getByTestId('item-delete'));

    await waitFor(() => expect(deleteInventoryItem).toHaveBeenCalledWith(31));
    // Closed, and the list re-read so the row goes.
    await waitFor(() => expect(screen.queryByTestId('item-retire')).toBeNull());
    confirm.mockRestore();
  });

  it("shows the server's reason when the item is in use, and keeps the form open", async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteInventoryItem.mockRejectedValue(new Error(
      'Turmeric Powder has 250 g still on the shelf, 3 purchase order lines, so deleting it would take that history with it. Archive it instead.',
    ));
    await openEdit();

    fireEvent.click(screen.getByTestId('item-delete'));

    expect(await screen.findByText(/3 purchase order lines/)).toBeInTheDocument();
    expect(screen.getByTestId('item-retire')).toBeInTheDocument();
    confirm.mockRestore();
  });

  /*
   * Owner, 2026-09-09: "why 2 items in same name" — two Ghee rows, one with
   * pack sizes and one without. A duplicate splits the stock count and the
   * recipe link, so the second one gets questioned rather than made quietly.
   */
  it('asks before making a second item under a name already used', async () => {
    const err = Object.assign(new Error('taken'), {
      body: {
        message: 'There is already an item called "Ghee" (500 ml on hand).',
        conflict: 'inventory_item_name_in_use',
        existing: { id: 9, name: 'Ghee', unit: 'ml', current_stock: 500, is_active: true },
      },
    });
    createInventoryItem.mockRejectedValue(err);
    fetchInventoryItems.mockResolvedValue({
      data: [turmeric], meta: { current_page: 1, last_page: 1, total: 1 }, units: ['g'],
    });
    renderPage();
    fireEvent.click(await screen.findByText('+ Add Item'));
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Ghee' } });
    fireEvent.click(screen.getByText('Create'));

    const box = await screen.findByTestId('item-name-clash');
    expect(box).toHaveTextContent(/already an item called "Ghee"/);
    // Not made, and both answers on offer.
    expect(within(box).getByTestId('item-clash-add-anyway')).toBeInTheDocument();
    expect(within(box).getByTestId('item-clash-open-existing')).toBeInTheDocument();
  });

  it('makes the duplicate when told it is a different thing', async () => {
    const err = Object.assign(new Error('taken'), {
      body: {
        message: 'There is already an item called "Ghee".',
        conflict: 'inventory_item_name_in_use',
        existing: { id: 9, name: 'Ghee', unit: 'ml', current_stock: 0, is_active: true },
      },
    });
    createInventoryItem.mockRejectedValueOnce(err).mockResolvedValueOnce({ item: turmeric });
    fetchInventoryItems.mockResolvedValue({
      data: [turmeric], meta: { current_page: 1, last_page: 1, total: 1 }, units: ['g'],
    });
    renderPage();
    fireEvent.click(await screen.findByText('+ Add Item'));
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Ghee' } });
    fireEvent.click(screen.getByText('Create'));
    fireEvent.click(await screen.findByTestId('item-clash-add-anyway'));

    await waitFor(() => expect(createInventoryItem).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Ghee', allow_duplicate_name: true }),
    ));
  });

  it('marks an archived item on the list so it can be found again', async () => {
    fetchInventoryItems.mockResolvedValue({
      data: [{ ...turmeric, is_active: false }],
      meta: { current_page: 1, last_page: 1, total: 1 },
      units: ['g'],
    });
    renderPage();

    expect(await screen.findByText('Archived')).toBeInTheDocument();
  });
});
