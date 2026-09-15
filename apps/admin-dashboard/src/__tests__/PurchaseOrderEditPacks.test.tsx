import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PurchaseOrdersPage } from '../pages/PurchaseOrdersPage';

/*
 * Editing an order that was bought by the pack.
 *
 * The edit modal filled its quantity and cost boxes with pack figures — "2"
 * cases at "415" a case — but always sent them with no pack attached, so the
 * server read them as loose units in the item's own unit. Opening a packed
 * line and pressing Save without touching anything rewrote "2 cases of 210
 * eggs at MVR 1.976190 each" as "2 eggs at MVR 415 each": 418 eggs of stock
 * gone, and the item's weighted-average cost poisoned for every recipe that
 * uses it. The order total stayed MVR 830, so nothing looked wrong.
 *
 * Found 2026-09-07 while answering the owner's question about why one line on
 * a receive screen showed no pack.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));
vi.mock('../components/ItemSearch', () => ({ ItemSearch: () => null }));

const CASE = { id: 3, name: 'Case', base_units: 210 };
const TRAY = { id: 4, name: 'Tray', base_units: 30 };

const packedLine = {
  id: 55,
  quantity: 420,
  received_quantity: 0,
  receive_status: 'pending',
  unit_cost: 1.976190,
  pack_name: 'Case',
  pack_size: '210.000000',
  pack_quantity: '2.000000',
  brand: null,
  inventory_item_id: 7,
  inventory_item: { id: 7, name: 'Egg', unit: 'pcs' },
};

const looseLine = {
  ...packedLine,
  id: 56,
  quantity: 5,
  unit_cost: 40,
  pack_name: null,
  pack_size: null,
  pack_quantity: null,
  inventory_item_id: 8,
  inventory_item: { id: 8, name: 'Butter', unit: 'kg' },
};

const po = {
  id: 1,
  purchase_number: 'PO-0001',
  supplier_id: 1,
  supplier: { id: 1, name: 'Fahi Store' },
  status: 'ordered',
  total: 1030,
  subtotal: 1030,
  purchase_date: '2026-09-07',
  created_at: '2026-09-07T00:00:00Z',
  items: [packedLine, looseLine],
  can_edit: true,
  can_cancel: true,
  can_delete: false,
  can_undo_receipt: false,
};

const fetchPurchases = vi.fn();
const updatePurchaseLines = vi.fn();
const getPurchaseUnits = vi.fn();

vi.mock('../api', () => ({
  fetchPurchases: (...a: unknown[]) => fetchPurchases(...a),
  updatePurchaseLines: (...a: unknown[]) => updatePurchaseLines(...a),
  getPurchaseUnits: (...a: unknown[]) => getPurchaseUnits(...a),
  cancelPurchase: vi.fn(),
  deletePurchase: vi.fn(),
  undoPurchaseReceipt: vi.fn(),
  fetchSuppliers: vi.fn().mockResolvedValue({ data: [] }),
  getPurchaseSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
  createPurchaseFromSuggest: vi.fn(),
  createPurchase: vi.fn(),
  approvePurchase: vi.fn(),
  receivePurchase: vi.fn(),
  updatePurchase: vi.fn(),
  importPurchaseCsv: vi.fn(),
  uploadPurchaseReceipt: vi.fn(),
  createPurchaseUnit: vi.fn(),
  createInventoryItem: vi.fn(),
}));

async function openTheEditor() {
  render(<MemoryRouter><PurchaseOrdersPage /></MemoryRouter>);
  fireEvent.click(await screen.findByText('Edit'));
  const dialog = await screen.findByRole('dialog');
  // The packs load before the rows can show their pickers.
  await screen.findByTestId('po-edit-pack-0');
  return dialog;
}

function saveButton(dialog: HTMLElement) {
  return [...dialog.querySelectorAll('button')].find((b) => /save/i.test(b.textContent ?? ''))!;
}

describe('Editing a purchase order line bought by the pack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPurchases.mockResolvedValue({ purchases: { data: [po], current_page: 1, last_page: 1, total: 1 } });
    updatePurchaseLines.mockResolvedValue({ purchase: po });
    getPurchaseUnits.mockImplementation((id: number) => Promise.resolve(
      id === 7
        ? { base_unit: 'pcs', purchase_units: [CASE, TRAY] }
        : { base_unit: 'kg', purchase_units: [] },
    ));
  });

  it('saves an untouched packed line exactly as it was ordered', async () => {
    const dialog = await openTheEditor();

    // Shown in the pack it was bought in, with what that is in stock.
    expect((within(dialog).getByLabelText('Buy Egg by') as HTMLSelectElement).value).toBe('3');
    expect(within(dialog).getByLabelText('Quantity for Egg')).toHaveValue(2);
    // 1.976190 × 210 is 414.99989999999997 in floating point; nobody typed that.
    expect(within(dialog).getByLabelText('Unit cost for Egg')).toHaveValue(415);
    expect(within(dialog).getByTestId('po-edit-base-0')).toHaveTextContent('= 420 pcs');

    fireEvent.click(saveButton(dialog));

    await waitFor(() => expect(updatePurchaseLines).toHaveBeenCalled());
    const [, payload] = updatePurchaseLines.mock.calls[0] as [number, { inventory_item_id: number; quantity: number; unit_cost: number; purchase_unit_id?: number }[]];
    expect(payload[0]).toMatchObject({ inventory_item_id: 7, quantity: 2, unit_cost: 415, purchase_unit_id: 3 });
    // The loose line stays loose, in the item's own unit.
    expect(payload[1]).toMatchObject({ inventory_item_id: 8, quantity: 5, unit_cost: 40 });
    expect(payload[1]).not.toHaveProperty('purchase_unit_id');
  });

  it('lets the pack be changed, and says what the new one comes to', async () => {
    const dialog = await openTheEditor();

    fireEvent.change(within(dialog).getByLabelText('Buy Egg by'), { target: { value: '4' } });
    expect(within(dialog).getByTestId('po-edit-base-0')).toHaveTextContent('= 60 pcs');

    fireEvent.click(saveButton(dialog));
    await waitFor(() => expect(updatePurchaseLines).toHaveBeenCalled());
    const [, payload] = updatePurchaseLines.mock.calls[0] as [number, { purchase_unit_id?: number }[]];
    expect(payload[0]).toMatchObject({ quantity: 2, purchase_unit_id: 4 });
  });

  it('can put a packed line back to loose units', async () => {
    const dialog = await openTheEditor();

    fireEvent.change(within(dialog).getByLabelText('Buy Egg by'), { target: { value: '' } });
    // Nothing to convert any more, so no conversion line.
    expect(within(dialog).queryByTestId('po-edit-base-0')).toBeNull();

    fireEvent.click(saveButton(dialog));
    await waitFor(() => expect(updatePurchaseLines).toHaveBeenCalled());
    const [, payload] = updatePurchaseLines.mock.calls[0] as [number, Record<string, unknown>[]];
    expect(payload[0]).not.toHaveProperty('purchase_unit_id');
  });

  /*
   * Owner, 2026-09-15: "in edit po, no option to change the date… can u add
   * most possible edit options." The header opens on what the order has and
   * only what was changed is sent, so an untouched old date is not re-judged
   * against the back-dating window.
   */
  it('edits the shop, the dates, the notes and a line brand, sending only what changed', async () => {
    getPurchaseUnits.mockImplementation((id: number) => Promise.resolve(
      id === 7
        ? { base_unit: 'pcs', purchase_units: [CASE, TRAY], brands: ['Sunrise', 'Royal'] }
        : { base_unit: 'kg', purchase_units: [] },
    ));
    const dialog = await openTheEditor();

    expect(within(dialog).getByLabelText('Edit bought from')).toHaveValue('Fahi Store');
    expect(within(dialog).getByTestId('po-edit-purchase-date')).toHaveValue('2026-09-07');
    expect(within(dialog).getByTestId('po-edit-expected-date')).toHaveValue('');

    fireEvent.change(within(dialog).getByTestId('po-edit-purchase-date'), { target: { value: '2026-09-05' } });
    fireEvent.change(within(dialog).getByTestId('po-edit-expected-date'), { target: { value: '2026-09-12' } });
    fireEvent.change(within(dialog).getByLabelText('Notes'), { target: { value: 'Bill came late' } });
    fireEvent.change(within(dialog).getByLabelText('Edit bought from'), { target: { value: 'Corner Shop' } });
    const brand = within(dialog).getByLabelText('Brand for Egg');
    fireEvent.focus(brand);
    fireEvent.mouseDown(within(dialog).getByRole('option', { name: 'Royal' }));

    fireEvent.click(saveButton(dialog));
    await waitFor(() => expect(updatePurchaseLines).toHaveBeenCalled());
    const [, lines, header] = updatePurchaseLines.mock.calls[0] as [number, { brand?: string }[], Record<string, unknown>];
    expect(header).toEqual({
      supplier_name_text: 'Corner Shop',
      purchase_date: '2026-09-05',
      expected_delivery_date: '2026-09-12',
      notes: 'Bill came late',
    });
    expect(lines[0]).toMatchObject({ brand: 'Royal' });
  });

  it('sends no header fields when only the lines were touched', async () => {
    // So an untouched old date is not re-judged against the back-dating window.
    const dialog = await openTheEditor();
    fireEvent.click(saveButton(dialog));

    await waitFor(() => expect(updatePurchaseLines).toHaveBeenCalled());
    expect(updatePurchaseLines.mock.calls[0][2]).toBeUndefined();
  });

  it('will not save an order with no seller', async () => {
    const dialog = await openTheEditor();
    fireEvent.change(within(dialog).getByLabelText('Edit bought from'), { target: { value: '' } });
    fireEvent.click(saveButton(dialog));

    expect(await screen.findByText(/An order needs a seller/)).toBeInTheDocument();
    expect(updatePurchaseLines).not.toHaveBeenCalled();
  });

  it('falls back to the stored unit when the pack no longer exists', async () => {
    // Somebody deleted the Case, or resized it, after the order was placed.
    getPurchaseUnits.mockImplementation((id: number) => Promise.resolve(
      id === 7 ? { base_unit: 'pcs', purchase_units: [TRAY] } : { base_unit: 'kg', purchase_units: [] },
    ));
    const dialog = await openTheEditor();

    expect(within(dialog).getByTestId('po-edit-lostpack-0')).toHaveTextContent('Was bought as Case of 210');
    // The stored figures are already per unit, so nothing is lost by showing them.
    expect(within(dialog).getByLabelText('Quantity for Egg')).toHaveValue(420);

    fireEvent.click(saveButton(dialog));
    await waitFor(() => expect(updatePurchaseLines).toHaveBeenCalled());
    const [, payload] = updatePurchaseLines.mock.calls[0] as [number, { quantity: number; purchase_unit_id?: number }[]];
    expect(payload[0].quantity).toBe(420);
    expect(payload[0]).not.toHaveProperty('purchase_unit_id');
  });
});
