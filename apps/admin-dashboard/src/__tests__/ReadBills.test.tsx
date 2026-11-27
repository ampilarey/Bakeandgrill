import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PurchaseOrdersPage, billLineText, linesFromBill } from '../pages/PurchaseOrdersPage';
import { billSummary } from '../components/purchasebills/BillsToCheck';
import type { PurchaseBill } from '../api/purchasing';

/*
 * Owner, 2026-11-15: "I have a pile of bills to enter. But I have no time. Can you
 * add … OCR so when I send an invoice it automatically reads the items, price,
 * quantity and fills the manual PO. So admin just needs to check and approve."
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));

const flour = { id: 4, name: 'Flour', unit: 'kg', cost_per_unit: 20, gst_rate_bp: 0, sku: null, quantity_on_hand: 0, reorder_level: null, category: null };
const cola = { id: 8, name: 'Cola 500ml', unit: 'bottle', cost_per_unit: 7, gst_rate_bp: 0, sku: null, quantity_on_hand: 0, reorder_level: null, category: null };

vi.mock('../components/ItemSearch', () => ({
  ItemSearch: ({ onChange }: { onChange?: (v: unknown) => void }) => (
    <button type="button" onClick={() => onChange?.({ id: cola.id, label: cola.name, item: cola })}>pick-cola</button>
  ),
}));

const createPurchase = vi.fn();
const getPurchaseUnits = vi.fn();
vi.mock('../api', () => ({
  getPurchaseUnits: (...a: unknown[]) => getPurchaseUnits(...a),
  getSupplierFrequentItems: vi.fn().mockResolvedValue({ supplier: null, items: [] }),
  createPurchase: (...a: unknown[]) => createPurchase(...a),
  fetchPurchases: vi.fn().mockResolvedValue({ purchases: { data: [], current_page: 1, last_page: 1, total: 0 } }),
  fetchSuppliers: vi.fn().mockResolvedValue({ data: [{ id: 3, name: 'Agora', is_active: true }] }),
  getPurchaseSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
  approvePurchase: vi.fn(), cancelPurchase: vi.fn(), deletePurchase: vi.fn(), undoPurchaseReceipt: vi.fn(),
  updatePurchaseLines: vi.fn(), receivePurchase: vi.fn(), updatePurchase: vi.fn(), createPurchaseFromSuggest: vi.fn(),
  importPurchaseCsv: vi.fn(), uploadPurchaseReceipt: vi.fn(), createPurchaseUnit: vi.fn(), createInventoryItem: vi.fn(),
}));

const fetchPurchaseBills = vi.fn();
const sendPurchaseBill = vi.fn();
const readPurchaseBill = vi.fn();
const removePurchaseBill = vi.fn();
const sendPurchaseBillText = vi.fn();
const ocrLines = vi.fn();
vi.mock('../api/purchasing', () => ({
  fetchPurchaseBills: (...a: unknown[]) => fetchPurchaseBills(...a),
  sendPurchaseBill: (...a: unknown[]) => sendPurchaseBill(...a),
  readPurchaseBill: (...a: unknown[]) => readPurchaseBill(...a),
  removePurchaseBill: (...a: unknown[]) => removePurchaseBill(...a),
  sendPurchaseBillText: (...a: unknown[]) => sendPurchaseBillText(...a),
  downloadPurchaseBill: vi.fn(),
}));
// Tesseract's own files are not loaded in a test: the reader is stood in for.
vi.mock('../components/poinvoice/ocrText', () => ({ ocrLines: (...a: unknown[]) => ocrLines(...a) }));

const line = (over: Record<string, unknown>) => ({
  name: 'WHEAT FLOUR', item_id: flour.id, item: flour, new_name: '', new_unit: '', quantity: 5, unit: '',
  unit_price: 22, amount: 110, gst: false, unsure: false, ...over,
});

const ready: PurchaseBill = {
  id: 31, status: 'ready', file_name: 'IMG_0101.jpg', is_image: true, error: null, sent_at: null,
  data: {
    shop: 'Agora', bill_no: 'INV-77', date: '2026-11-10', total: 290, gst_total: 0, note: '', lines_total: 290, seen_before: null,
    lines: [
      line({}),
      line({ name: 'C/COLA 500ML CTN', item_id: null, item: null, new_name: 'Cola 500ml', new_unit: 'bottle', quantity: 1, unit: 'carton', unit_price: 180, amount: 180 }),
    ] as never,
  },
};

function page() {
  render(<MemoryRouter><PurchaseOrdersPage /></MemoryRouter>);
}

describe('Read bills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPurchaseBills.mockResolvedValue({ enabled: true, bills: [ready] });
    getPurchaseUnits.mockResolvedValue({ base_unit: 'kg', purchase_units: [], brands: [], last_purchase: null });
    createPurchase.mockResolvedValue({ purchase: { id: 1 } });
  });

  it('says what a bill came to in one line', () => {
    expect(billSummary(ready)).toBe('2026-11-10 · 2 items · MVR 290.00 · 1 not in inventory');
    expect(billSummary({ ...ready, status: 'failed', error: 'Too blurred.', data: null })).toBe('Too blurred.');
    expect(billSummary({ ...ready, status: 'reading', data: null })).toBe('Reading…');
  });

  it('turns the bill into lines that keep the price and unit on the bill', () => {
    const lines = linesFromBill(ready.data!.lines, true);
    expect(lines[0].selection?.item.name).toBe('Flour');
    expect(lines[0]).toMatchObject({ quantity: '5', unit_cost: '22', unitText: '', costTyped: true, unitTyped: true });
    expect(lines[1].selection).toBeNull();
    expect(lines[1].newItem).toEqual({ name: 'Cola 500ml', unit: 'bottle' });
    expect(lines[1]).toMatchObject({ quantity: '1', unit_cost: '180', unitText: 'carton' });
    expect(billLineText(lines[1].bill!)).toBe('1 carton × MVR 180.00 = MVR 180.00');
    // Someone who may not add inventory items gets no half-open form.
    expect(linesFromBill(ready.data!.lines, false)[1].newItem).toBeNull();
  });

  it('sends each picked file and reads it, one after another', async () => {
    // Empty at first; asked again once the pile is through, when the read one is on it.
    fetchPurchaseBills.mockResolvedValueOnce({ enabled: true, bills: [] })
      .mockResolvedValue({ enabled: true, bills: [{ ...ready, id: 40 }] });
    sendPurchaseBill.mockResolvedValueOnce({ bill: { ...ready, id: 40, status: 'queued', data: null } })
      .mockRejectedValueOnce(new Error('This bill is already on the list.'));
    readPurchaseBill.mockResolvedValue({ bill: { ...ready, id: 40 } });
    page();

    const input = await screen.findByTestId('bills-file');
    const a = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const b = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [a, b] } });

    expect(await screen.findByTestId('bill-check-40')).toBeInTheDocument();
    expect(readPurchaseBill).toHaveBeenCalledWith(40);
    expect(await screen.findByTestId('bills-problem')).toHaveTextContent('b.jpg: This bill is already on the list.');
  });

  // Owner, 2026-11-27: Tesseract as the free reader. The browser reads the picture and sends the text.
  it('with Tesseract picked, reads each bill in the browser and sends its lines', async () => {
    fetchPurchaseBills.mockResolvedValueOnce({ enabled: true, in_browser: true, bills: [] })
      .mockResolvedValue({ enabled: true, in_browser: true, bills: [{ ...ready, id: 41 }] });
    sendPurchaseBill.mockResolvedValue({ bill: { ...ready, id: 41, status: 'queued', data: null } });
    ocrLines.mockResolvedValue(['HAPPY MARKET', 'Flour 5 22.00 110.00']);
    sendPurchaseBillText.mockResolvedValue({ bill: { ...ready, id: 41 } });
    page();

    expect(await screen.findByTestId('bills-in-browser')).toHaveTextContent('Tesseract (free)');
    fireEvent.change(await screen.findByTestId('bills-file'), { target: { files: [new File(['a'], 'a.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(sendPurchaseBillText).toHaveBeenCalledWith(41, ['HAPPY MARKET', 'Flour 5 22.00 110.00']));
    expect(readPurchaseBill).not.toHaveBeenCalled();
    expect(await screen.findByTestId('bill-check-41')).toBeInTheDocument();
  });

  it('says so when no key is set, and takes nothing', async () => {
    fetchPurchaseBills.mockResolvedValue({ enabled: false, bills: [] });
    page();
    expect(await screen.findByTestId('bills-to-check')).toHaveTextContent('not set up yet');
    expect(screen.getByTestId('bills-send')).toBeDisabled();
  });

  it('opens the manual order filled in, and will not save a line with no item', async () => {
    page();
    fireEvent.click(await screen.findByTestId('bill-check-31'));

    const banner = await screen.findByTestId('manual-po-bill');
    expect(banner).toHaveTextContent('Read from a bill (no. INV-77)');
    expect(screen.getByTestId('manual-po-purchase-date')).toHaveValue('2026-11-10');
    // Only the flour counts until the cola has an item, so the totals disagree.
    expect(screen.getByTestId('manual-po-bill-match')).toHaveTextContent("The bill's total is MVR 290.00. These lines add up to MVR 110.00.");
    expect(screen.getByTestId('manual-po-bill-line-1')).toHaveTextContent('On the bill: C/COLA 500ML CTN · 1 carton × MVR 180.00 = MVR 180.00');

    fireEvent.click(screen.getByRole('button', { name: /Create Purchase Order|Create PO|^Create/ }));
    expect(await screen.findByText(/1 line from the bill has no item yet/)).toBeInTheDocument();
    expect(createPurchase).not.toHaveBeenCalled();
  });

  it('keeps the bill price when the item is picked, and saves with the bill', async () => {
    // The carton is already a pack of the cola, so the line needs nothing more.
    getPurchaseUnits.mockResolvedValue({ base_unit: 'bottle', purchase_units: [{ id: 6, name: 'Carton', base_units: 24, brand: null, brand_key: null, default_unit_cost: 170 }], brands: [], last_purchase: null });
    page();
    fireEvent.click(await screen.findByTestId('bill-check-31'));
    await screen.findByTestId('manual-po-bill');

    fireEvent.click(screen.getByRole('button', { name: 'pick-cola' }));
    await waitFor(() => expect(screen.getByTestId('manual-po-bill-match')).toHaveTextContent("The lines add up to the bill's total, MVR 290.00."));

    fireEvent.click(screen.getByRole('button', { name: /Create Purchase Order|Create PO|^Create/ }));
    await waitFor(() => expect(createPurchase).toHaveBeenCalled());
    const sent = createPurchase.mock.calls[0][0];
    expect(sent).toMatchObject({ supplier_name_text: 'Agora', purchase_date: '2026-11-10', bill_id: 31, supplier_invoice_no: 'INV-77' });
    expect(sent.items).toHaveLength(2);
    expect(sent.items[0]).toMatchObject({ inventory_item_id: 4, quantity: 5, unit_cost: 22 });
    expect(sent.items[1]).toMatchObject({ inventory_item_id: 8, quantity: 1, unit_cost: 180, purchase_unit_id: 6 });
  });
});
