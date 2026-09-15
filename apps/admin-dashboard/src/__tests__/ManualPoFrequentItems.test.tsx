import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PurchaseOrdersPage, frequentTileNote, lineSummaryText } from '../pages/PurchaseOrdersPage';

/*
 * Owner, 2026-09-14: "when more than one item is there now its difficult.
 * View is horrible. Can u add a feature where shop is selected, its most
 * frequent item appears for easier selection."
 *
 * Two answers. Name the shop and what it usually sells us is a row of
 * things to tap. And a line not being worked on is one row, not a card of
 * boxes, so an order of eight things fits on a phone.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));

const bun = { id: 9, name: 'Hotdog bun', unit: 'piece', cost_per_unit: 4.9, gst_rate_bp: 0, sku: null, quantity_on_hand: 0, reorder_level: null, category: null };
const egg = { id: 10, name: 'Egg', unit: 'piece', cost_per_unit: 2, gst_rate_bp: 0, sku: null, quantity_on_hand: 0, reorder_level: null, category: null };

vi.mock('../components/ItemSearch', () => ({
  ItemSearch: ({ onChange }: { onChange?: (v: unknown) => void }) => (
    <button type="button" onClick={() => onChange?.({ id: bun.id, label: bun.name, item: bun })}>pick-bun</button>
  ),
}));

const getPurchaseUnits = vi.fn();
const getSupplierFrequentItems = vi.fn();
const createPurchase = vi.fn();

vi.mock('../api', () => ({
  getPurchaseUnits: (...a: unknown[]) => getPurchaseUnits(...a),
  getSupplierFrequentItems: (...a: unknown[]) => getSupplierFrequentItems(...a),
  createPurchase: (...a: unknown[]) => createPurchase(...a),
  fetchPurchases: vi.fn().mockResolvedValue({ purchases: { data: [], current_page: 1, last_page: 1, total: 0 } }),
  fetchSuppliers: vi.fn().mockResolvedValue({ data: [{ id: 3, name: 'The Royal Bakery', is_active: true }] }),
  getPurchaseSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
  approvePurchase: vi.fn(), cancelPurchase: vi.fn(), deletePurchase: vi.fn(), undoPurchaseReceipt: vi.fn(),
  updatePurchaseLines: vi.fn(), receivePurchase: vi.fn(), updatePurchase: vi.fn(), createPurchaseFromSuggest: vi.fn(),
  importPurchaseCsv: vi.fn(), uploadPurchaseReceipt: vi.fn(), createPurchaseUnit: vi.fn(), createInventoryItem: vi.fn(),
}));

const usual = {
  supplier: { id: 3, name: 'The Royal Bakery' },
  items: [
    { item: bun, orders: 7, last_purchase_date: '2026-09-07', last_brand: 'Royal', last_pack_name: 'Packet', last_pack_size: 6, last_pack_cost: 30, last_unit_cost: 5, last_quantity: 2 },
    { item: egg, orders: 3, last_purchase_date: '2026-09-01', last_brand: null, last_pack_name: null, last_pack_size: null, last_pack_cost: null, last_unit_cost: 2, last_quantity: 30 },
  ],
};

async function openCard() {
  render(<MemoryRouter><PurchaseOrdersPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /Manual PO/i }));
  return await screen.findByLabelText('Bought from');
}

async function nameTheShop() {
  const seller = await openCard();
  // The supplier list has to have arrived before it can be picked from.
  fireEvent.focus(seller);
  fireEvent.mouseDown(await screen.findByRole('option', { name: 'The Royal Bakery' }));
  return await screen.findByTestId('manual-po-frequent');
}

describe('What a shop usually sells us', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'piece',
      purchase_units: [{ id: 3, name: 'Packet', base_units: 6, brand: 'Royal', brand_key: 'royal', default_unit_cost: 30 }],
      brands: ['Royal'],
      last_purchase: null,
    });
    getSupplierFrequentItems.mockResolvedValue(usual);
    createPurchase.mockResolvedValue({ purchase: { id: 1 } });
  });

  it('appears once a shop on file is picked', async () => {
    const strip = await nameTheShop();

    await waitFor(() => expect(getSupplierFrequentItems).toHaveBeenCalledWith({ supplier_id: 3 }));
    expect(strip).toHaveTextContent('Usually bought from The Royal Bakery');
    expect(await within(strip).findByTestId('manual-po-frequent-9')).toHaveTextContent('Hotdog bun');
    expect(within(strip).getByTestId('manual-po-frequent-9')).toHaveTextContent('last 2 Packet · MVR 30.00 · Royal');
    expect(within(strip).getByTestId('manual-po-frequent-10')).toHaveTextContent('last 30 piece · MVR 2.00/piece');
  });

  it('appears for a shop on file typed by hand, however it is capitalised', async () => {
    const seller = await openCard();
    fireEvent.focus(seller);
    await screen.findByRole('option', { name: 'The Royal Bakery' });
    fireEvent.change(seller, { target: { value: 'the royal bakery' } });

    expect(await screen.findByTestId('manual-po-frequent')).toHaveTextContent('Usually bought from The Royal Bakery');
  });

  it('is not there for a shop that is not on file', async () => {
    const seller = await openCard();
    fireEvent.change(seller, { target: { value: 'Somewhere new' } });

    expect(screen.queryByTestId('manual-po-frequent')).toBeNull();
    expect(getSupplierFrequentItems).not.toHaveBeenCalled();
  });

  /*
   * Owner, 2026-09-14: "adding items like pos, 1 click = quantity 1, 2 clicks
   * = quantity 2." A tile is a key on the till.
   */
  it('puts a tapped item on the order as one, using the empty first line', async () => {
    const strip = await nameTheShop();
    fireEvent.click(await within(strip).findByTestId('manual-po-frequent-9'));

    // The blank line the form opened with is the one that got used.
    await waitFor(() => expect(screen.getByTestId('manual-po-line-0')).toHaveTextContent('Hotdog bun'));
    expect(screen.queryByTestId('manual-po-line-1')).toBeNull();
    // Brand, box and price fill in the way any picked item's do.
    await waitFor(() => expect(getPurchaseUnits).toHaveBeenCalledWith(9));
    await waitFor(() => expect(screen.getByTestId('manual-po-line-0')).toHaveTextContent('Royal · 1 Packet × MVR 30.00'));
    expect(screen.getByTestId('manual-po-line-total-0')).toHaveTextContent('MVR 30.00');
    // And the tile counts.
    expect(within(strip).getByTestId('manual-po-frequent-count-9')).toHaveTextContent('×1');
  });

  it('counts one more on every tap, and one less on the minus', async () => {
    const strip = await nameTheShop();
    const tile = await within(strip).findByTestId('manual-po-frequent-9');
    fireEvent.click(tile);
    fireEvent.click(tile);
    fireEvent.click(tile);

    expect(within(strip).getByTestId('manual-po-frequent-count-9')).toHaveTextContent('×3');
    await waitFor(() => expect(screen.getByTestId('manual-po-line-total-0')).toHaveTextContent('MVR 90.00'));

    fireEvent.click(within(strip).getByLabelText('One less Hotdog bun'));
    expect(within(strip).getByTestId('manual-po-frequent-count-9')).toHaveTextContent('×2');

    // Down to nothing takes the line off the order and clears the badge.
    fireEvent.click(within(strip).getByLabelText('One less Hotdog bun'));
    fireEvent.click(within(strip).getByLabelText('One less Hotdog bun'));
    expect(within(strip).queryByTestId('manual-po-frequent-count-9')).toBeNull();
    // What is left is a blank line, open and ready.
    expect(screen.getByTestId('manual-po-line-0')).toHaveTextContent('Item 1');
    expect(screen.getByLabelText('Quantity for item 1')).toHaveValue(1);
  });

  it('adds a second tapped item as a new row rather than replacing the first', async () => {
    const strip = await nameTheShop();
    fireEvent.click(await within(strip).findByTestId('manual-po-frequent-9'));
    fireEvent.click(within(strip).getByTestId('manual-po-frequent-10'));

    await waitFor(() => expect(screen.getByTestId('manual-po-line-1')).toHaveTextContent('Egg'));
    expect(screen.getByTestId('manual-po-line-0')).toHaveTextContent('Hotdog bun');
  });

  it('sends the tapped items the same way as typed ones', async () => {
    const strip = await nameTheShop();
    fireEvent.click(await within(strip).findByTestId('manual-po-frequent-9'));
    fireEvent.click(within(strip).getByTestId('manual-po-frequent-9'));
    await waitFor(() => expect(screen.getByTestId('manual-po-line-total-0')).toHaveTextContent('MVR 60.00'));

    fireEvent.click(screen.getByRole('button', { name: /Create PO/i }));

    await waitFor(() => expect(createPurchase).toHaveBeenCalled());
    const payload = createPurchase.mock.calls[0][0] as { supplier_name_text: string; items: Record<string, unknown>[] };
    expect(payload.supplier_name_text).toBe('The Royal Bakery');
    expect(payload.items[0]).toMatchObject({ inventory_item_id: 9, quantity: 2, unit_cost: 30, purchase_unit_id: 3, brand: 'Royal' });
  });
});

describe('Lines as rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPurchaseUnits.mockResolvedValue({ base_unit: 'piece', purchase_units: [], brands: [], last_purchase: null });
    getSupplierFrequentItems.mockResolvedValue({ supplier: null, items: [] });
  });

  it('opens one line at a time: adding a line closes the one before into a row', async () => {
    await openCard();
    fireEvent.click(screen.getByText('pick-bun'));
    await waitFor(() => expect(screen.getByLabelText('Unit cost for item 1')).toHaveValue(4.9));
    fireEvent.change(screen.getByLabelText('Quantity for item 1'), { target: { value: '3' } });

    fireEvent.click(screen.getByRole('button', { name: /Add line/i }));

    // Line 1 is a row now — its boxes are gone, its summary is there.
    expect(screen.queryByLabelText('Quantity for item 1')).toBeNull();
    expect(screen.getByTestId('manual-po-line-0')).toHaveTextContent('Hotdog bun');
    expect(screen.getByTestId('manual-po-line-0')).toHaveTextContent('3 piece × MVR 4.90');
    expect(screen.getByTestId('manual-po-line-total-0')).toHaveTextContent('MVR 14.70');
    // Line 2 is the open one.
    expect(screen.getByLabelText('Quantity for item 2')).toBeInTheDocument();
  });

  it('reopens a row when it is tapped, and closes it with Done', async () => {
    await openCard();
    fireEvent.click(screen.getByText('pick-bun'));
    fireEvent.click(screen.getByRole('button', { name: /Add line/i }));

    fireEvent.click(screen.getByLabelText('Edit item 1'));
    expect(screen.getByLabelText('Quantity for item 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Quantity for item 2')).toBeNull();

    fireEvent.click(screen.getByLabelText('Done with item 1'));
    expect(screen.queryByLabelText('Quantity for item 1')).toBeNull();
  });

  it('says on the row when a line still needs something', async () => {
    await openCard();
    fireEvent.click(screen.getByText('pick-bun'));
    fireEvent.change(screen.getByLabelText('Unit cost for item 1'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Add line/i }));

    expect(screen.getByTestId('manual-po-line-0')).toHaveTextContent('price?');
    expect(screen.getByTestId('manual-po-line-total-0')).toHaveTextContent('—');
  });

  it('removes a row and keeps the numbering straight', async () => {
    await openCard();
    fireEvent.click(screen.getByText('pick-bun'));
    fireEvent.click(screen.getByRole('button', { name: /Add line/i }));

    fireEvent.click(screen.getByLabelText('Remove item 1'));

    // The line that was second is the only one now, and still open.
    expect(screen.queryByTestId('manual-po-line-1')).toBeNull();
    expect(screen.getByLabelText('Quantity for item 1')).toBeInTheDocument();
  });
});

describe('the words on a row and a tile', () => {
  it('describes a line in one breath', () => {
    expect(lineSummaryText({ selection: null, brand: '', quantity: '1', unitText: '', unit_cost: '', packs: [] })).toBe('Tap to pick an item');
    expect(lineSummaryText({
      selection: { id: 9, label: 'Hotdog bun', item: bun as never }, brand: 'Royal', quantity: '2', unitText: 'Packet', unit_cost: '30',
      packs: [{ id: 3, name: 'Packet', base_units: 6 }],
    })).toBe('Royal · 2 Packet × MVR 30.00');
    // A unit nobody has defined is flagged on the row, not just inside it.
    expect(lineSummaryText({
      selection: { id: 9, label: 'Hotdog bun', item: bun as never }, brand: '', quantity: '1', unitText: 'Case', unit_cost: '400', packs: [],
    })).toBe('1 Case × MVR 400.00 · what is a case?');
  });

  it('says what was bought last time under a usual item', () => {
    expect(frequentTileNote(usual.items[0] as never)).toBe('last 2 Packet · MVR 30.00 · Royal');
    expect(frequentTileNote(usual.items[1] as never)).toBe('last 30 piece · MVR 2.00/piece');
    expect(frequentTileNote({ ...usual.items[1], last_quantity: null, last_unit_cost: null } as never)).toBe('');
  });
});
