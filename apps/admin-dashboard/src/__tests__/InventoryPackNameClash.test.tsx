import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';

/*
 * Owner, 2026-09-07: "sometimes we buy 6 pcs packets. And sometimes 10 pcs
 * packets." Two real sizes of the same bun.
 *
 * Adding a pack whose name is already taken used to resize the one already
 * there without a word, so typing "Packet" for the 10s turned the 6s into
 * 10s and every later order of hotdog buns converted wrong. The server now
 * refuses; this is the page asking which was meant.
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
// The brand-and-pack editor also loads the item's brands; none here.
vi.mock('../api/operations', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/operations')>(),
  getBrandPhotos: vi.fn().mockResolvedValue({ item_id: 9, photos: [] }),
  uploadBrandPhoto: vi.fn(),
  deleteBrandPhoto: vi.fn(),
}));

const bun = {
  id: 9,
  name: 'Hotdog bun',
  sku: 'BUN-1',
  barcode: null,
  unit: 'piece',
  quantity_on_hand: 40,
  reorder_level: 10,
  cost_per_unit: 2,
  category: { id: 1, name: 'Bakery' },
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

const PACKET_6 = { id: 3, name: 'Packet', base_units: 6, barcode: null };

const createPurchaseUnit = vi.fn();
const getPurchaseUnits = vi.fn();
const fetchInventoryItems = vi.fn();

/** What the server sends back when the name is taken for another size. */
class ApiError extends Error {
  body: unknown;

  constructor(body: unknown) {
    super('Conflict');
    this.body = body;
  }
}

const clashBody = {
  conflict: 'pack_name_in_use',
  message: '"Packet" on Hotdog bun already holds 6. Is this a correction, or a second size?',
  existing: { id: 3, name: 'Packet', base_units: 6 },
  requested_base_units: 10,
  suggested_name: 'Packet 10',
};

vi.mock('../api', () => ({
  fetchInventoryItems: (...a: unknown[]) => fetchInventoryItems(...a),
  getPurchaseUnits: (...a: unknown[]) => getPurchaseUnits(...a),
  createPurchaseUnit: (...a: unknown[]) => createPurchaseUnit(...a),
  packNameConflict: (e: unknown) => {
    const body = (e as { body?: { conflict?: string } })?.body;
    return body?.conflict === 'pack_name_in_use' ? body : null;
  },
  adjustInventoryStock: vi.fn(),
  fetchLowStockItems: vi.fn().mockResolvedValue({ data: [] }),
  fetchInventoryCategories: vi.fn().mockResolvedValue({ categories: [{ id: 1, name: 'Bakery' }] }),
  fetchSuppliers: vi.fn().mockResolvedValue({ data: [] }),
  getUnitConversions: vi.fn().mockResolvedValue({ conversions: [] }),
  fetchPreparedStock: vi.fn().mockResolvedValue({ rows: [] }),
  updatePurchaseUnit: vi.fn(),
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

/** Open the item's editor and type a second Packet, of 10. */
async function typeASecondPacket() {
  render(<MemoryRouter><InventoryPage /></MemoryRouter>);
  fireEvent.click(await screen.findByTitle('Edit this item'));

  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByText('Packet');

  // The 6s belong to no brand, so the 10s go under "Any brand" too.
  fireEvent.click(within(dialog).getByLabelText('Add a pack for any brand'));
  fireEvent.change(within(dialog).getByLabelText('Pack name'), { target: { value: 'Packet' } });
  fireEvent.change(within(dialog).getByLabelText('Amount in the pack'), { target: { value: '10' } });
  fireEvent.click(within(dialog).getByText('Add pack'));

  return dialog;
}

describe('A pack name that is already taken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchInventoryItems.mockResolvedValue({ data: [bun], meta: { current_page: 1, last_page: 1, total: 1 } });
    getPurchaseUnits.mockResolvedValue({ base_unit: 'piece', purchase_units: [PACKET_6] });
    createPurchaseUnit.mockRejectedValue(new ApiError(clashBody));
  });

  it('asks instead of quietly resizing the one already there', async () => {
    const dialog = await typeASecondPacket();

    const prompt = await within(dialog).findByTestId('pack-name-clash');
    expect(prompt).toHaveTextContent('already holds 6');
    expect(within(prompt).getByTestId('pack-clash-keep-both')).toHaveTextContent('Packet 10');
    expect(within(prompt).getByTestId('pack-clash-replace')).toHaveTextContent('Packet really holds 10');
  });

  it('keeps both sizes under the suggested name', async () => {
    const dialog = await typeASecondPacket();
    await within(dialog).findByTestId('pack-name-clash');

    createPurchaseUnit.mockResolvedValue({ purchase_unit: { id: 4, name: 'Packet 10', base_units: 10 } });
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'piece',
      purchase_units: [PACKET_6, { id: 4, name: 'Packet 10', base_units: 10, barcode: null }],
    });

    fireEvent.click(within(dialog).getByTestId('pack-clash-keep-both'));

    await waitFor(() => expect(createPurchaseUnit).toHaveBeenCalledTimes(2));
    expect(createPurchaseUnit.mock.calls[1][1]).toMatchObject({ name: 'Packet 10', base_units: 10 });
    // Not a replace: the 6s stay.
    expect(createPurchaseUnit.mock.calls[1][1]).not.toHaveProperty('replace');
    await waitFor(() => expect(within(dialog).queryByTestId('pack-name-clash')).toBeNull());
  });

  it('lets a genuine correction through when that is what was meant', async () => {
    const dialog = await typeASecondPacket();
    await within(dialog).findByTestId('pack-name-clash');

    createPurchaseUnit.mockResolvedValue({ purchase_unit: { id: 3, name: 'Packet', base_units: 10 } });

    fireEvent.click(within(dialog).getByTestId('pack-clash-replace'));

    await waitFor(() => expect(createPurchaseUnit).toHaveBeenCalledTimes(2));
    expect(createPurchaseUnit.mock.calls[1][1]).toMatchObject({ name: 'Packet', base_units: 10, replace: true });
  });

  it('backs out without saving anything', async () => {
    const dialog = await typeASecondPacket();
    await within(dialog).findByTestId('pack-name-clash');

    // The modal has its own Cancel; this one is inside the prompt.
    const prompt = within(dialog).getByTestId('pack-name-clash');
    fireEvent.click(within(prompt).getByText('Cancel'));

    expect(within(dialog).queryByTestId('pack-name-clash')).toBeNull();
    expect(createPurchaseUnit).toHaveBeenCalledTimes(1);
  });
});
