import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PurchaseOrdersPage } from '../pages/PurchaseOrdersPage';

/*
 * Owner, 2026-09-07: "will the system remember the latest price, brand… will
 * there be options to select the brand. By default it should be selected the
 * latest."
 *
 * The brands were remembered but only offered as a placeholder hint, the box
 * started empty, and the price was prefilled with the item's weighted-average
 * cost per unit — which is the wrong number entirely on a line bought by the
 * box. Now the line opens on what was actually last bought.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));

// A picker that "finds" the hotdog bun, so the line gets an item.
vi.mock('../components/ItemSearch', () => ({
  ItemSearch: ({ onChange }: { onChange?: (v: unknown) => void }) => (
    <button onClick={() => onChange?.({
      id: 9,
      label: 'Hotdog bun',
      item: { id: 9, name: 'Hotdog bun', unit: 'piece', cost_per_unit: 4.9, gst_rate_bp: 0 },
    })}>
      pick-bun
    </button>
  ),
}));

const PACKET_6 = { id: 3, name: 'Packet', base_units: 6, barcode: null };

const getPurchaseUnits = vi.fn();

vi.mock('../api', () => ({
  getPurchaseUnits: (...a: unknown[]) => getPurchaseUnits(...a),
  fetchPurchases: vi.fn().mockResolvedValue({ purchases: { data: [], current_page: 1, last_page: 1, total: 0 } }),
  fetchSuppliers: vi.fn().mockResolvedValue({ data: [] }),
  getPurchaseSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
  approvePurchase: vi.fn(),
  cancelPurchase: vi.fn(),
  deletePurchase: vi.fn(),
  undoPurchaseReceipt: vi.fn(),
  updatePurchaseLines: vi.fn(),
  receivePurchase: vi.fn(),
  updatePurchase: vi.fn(),
  createPurchaseFromSuggest: vi.fn(),
  createPurchase: vi.fn(),
  importPurchaseCsv: vi.fn(),
  uploadPurchaseReceipt: vi.fn(),
  createPurchaseUnit: vi.fn(),
  createInventoryItem: vi.fn(),
}));

/** Open the manual order card and pick the bun onto its first line. */
async function pickTheBun() {
  render(<MemoryRouter><PurchaseOrdersPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /Manual PO/i }));
  fireEvent.click(await screen.findByText('pick-bun'));
  return screen.getByText('pick-bun').closest('form, div') as HTMLElement;
}

describe('A purchase line opens on what was last bought', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'piece',
      purchase_units: [PACKET_6],
      brands: ['Sunrise', 'Royal'],
      last_purchase: {
        brand: 'Sunrise',
        unit_cost: 5,
        pack_cost: 30,
        purchase_unit_id: 3,
        pack_name: 'Packet',
        pack_size: 6,
        pack_quantity: 2,
        purchase_date: '2026-09-06',
        supplier: 'The Royal Bakery',
      },
    });
  });

  it('fills in the brand, the box and the price of that box', async () => {
    await pickTheBun();

    // The brand is chosen, not merely suggested.
    await waitFor(() => {
      expect((screen.getByLabelText('Brand for item 1') as HTMLSelectElement).value).toBe('Sunrise');
    });
    // Counted in the box it was last bought in, priced per box.
    expect(screen.getByLabelText('Unit for item 1')).toHaveValue('Packet');
    expect(screen.getByLabelText('Unit cost for item 1')).toHaveValue(30);
  });

  it('says where those numbers came from', async () => {
    await pickTheBun();

    const hint = await screen.findByTestId('manual-po-last-0');
    expect(hint).toHaveTextContent('Last bought 2026-09-06 from The Royal Bakery');
    expect(hint).toHaveTextContent('MVR 30.00 a Packet (6 piece)');
    expect(hint).toHaveTextContent('Sunrise');
  });

  it('offers every brand this item has been bought as', async () => {
    await pickTheBun();

    const select = await screen.findByLabelText('Brand for item 1');
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('Sunrise');
    expect(options).toContain('Royal');
    // And a way out for a brand never bought before.
    expect(options.some((o) => o?.includes('not bought before'))).toBe(true);
  });

  it('falls back to the average cost when the item has never been bought', async () => {
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'piece', purchase_units: [], brands: [], last_purchase: null,
    });
    await pickTheBun();

    await waitFor(() => expect(screen.getByLabelText('Unit cost for item 1')).toHaveValue(4.9));
    expect(screen.queryByTestId('manual-po-last-0')).toBeNull();
  });

  /*
   * Owner, 2026-09-12: "In po, when brand is selected, its defaults should
   * appear." The line opened on Sunrise's packet at MVR 30; picking Royal
   * must bring Royal's box and Royal's price, not leave Sunrise's behind.
   * Before this the price box counted as "touched" the moment the last
   * purchase filled it, so a brand pick never changed it.
   */
  it("switching brand brings that brand's own box and price over the last purchase's", async () => {
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'piece',
      purchase_units: [
        PACKET_6,
        { id: 4, name: 'Tray', base_units: 30, brand: 'Royal', brand_key: 'royal', default_unit_cost: 140, default_cost_updated_at: '2026-09-10T00:00:00Z' },
      ],
      brands: ['Sunrise', 'Royal'],
      last_purchase: {
        brand: 'Sunrise', unit_cost: 5, pack_cost: 30, purchase_unit_id: 3,
        pack_name: 'Packet', pack_size: 6, pack_quantity: 2, purchase_date: '2026-09-06', supplier: 'The Royal Bakery',
      },
    });
    await pickTheBun();
    await waitFor(() => expect(screen.getByLabelText('Unit cost for item 1')).toHaveValue(30));

    fireEvent.change(screen.getByLabelText('Brand for item 1'), { target: { value: 'Royal' } });

    expect(screen.getByLabelText('Unit for item 1')).toHaveValue('Tray');
    expect(screen.getByLabelText('Unit cost for item 1')).toHaveValue(140);
    // And says where the figure came from.
    expect(screen.getByTestId('manual-po-usual-0')).toHaveTextContent("Royal's tray usually costs MVR 140.00");
  });

  it('leaves a price the person typed alone when the brand changes', async () => {
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'piece',
      purchase_units: [
        PACKET_6,
        { id: 4, name: 'Tray', base_units: 30, brand: 'Royal', brand_key: 'royal', default_unit_cost: 140 },
      ],
      brands: ['Sunrise', 'Royal'],
      last_purchase: null,
    });
    await pickTheBun();
    await waitFor(() => expect(screen.getByLabelText('Unit cost for item 1')).toHaveValue(4.9));

    fireEvent.change(screen.getByLabelText('Unit cost for item 1'), { target: { value: '99' } });
    fireEvent.change(screen.getByLabelText('Brand for item 1'), { target: { value: 'Royal' } });

    // The box follows the brand; the typed price is theirs.
    expect(screen.getByLabelText('Unit for item 1')).toHaveValue('Tray');
    expect(screen.getByLabelText('Unit cost for item 1')).toHaveValue(99);
  });

  it("opens on a brand's register price when it has been set up but never bought", async () => {
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'piece',
      purchase_units: [{ id: 4, name: 'Tray', base_units: 30, brand: 'Royal', brand_key: 'royal', default_unit_cost: 140 }],
      brands: ['Royal'],
      last_purchase: null,
    });
    await pickTheBun();

    fireEvent.change(await screen.findByLabelText('Brand for item 1'), { target: { value: 'Royal' } });

    expect(screen.getByLabelText('Unit for item 1')).toHaveValue('Tray');
    expect(screen.getByLabelText('Unit cost for item 1')).toHaveValue(140);
  });

  it('says so when the pack has changed since that purchase', async () => {
    getPurchaseUnits.mockResolvedValue({
      base_unit: 'piece',
      purchase_units: [{ id: 3, name: 'Packet', base_units: 8, barcode: null }],
      brands: ['Sunrise'],
      last_purchase: {
        brand: 'Sunrise', unit_cost: 5, pack_cost: 30,
        // The server could not match the snapshot to a live pack.
        purchase_unit_id: null,
        pack_name: 'Packet', pack_size: 6, pack_quantity: 2,
        purchase_date: '2026-09-06', supplier: 'The Royal Bakery',
      },
    });
    await pickTheBun();

    const hint = await screen.findByTestId('manual-po-last-0');
    expect(hint).toHaveTextContent('that pack has changed since');
    // Priced per piece, since the box it was bought in is no longer that box.
    await waitFor(() => expect(screen.getByLabelText('Unit cost for item 1')).toHaveValue(5));
    expect(screen.getByLabelText('Unit for item 1')).toHaveValue('');
  });
});
