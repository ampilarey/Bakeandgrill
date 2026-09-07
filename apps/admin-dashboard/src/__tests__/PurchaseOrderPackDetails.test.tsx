import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PurchaseOrdersPage } from '../pages/PurchaseOrdersPage';

/*
 * Owner, 2026-09-07: "can u add pack details also in this" — the receive
 * modal listed "16.0000" against Sweet Bun and nothing else, so whoever is at
 * the door with the boxes cannot tell whether that is two packs of eight or
 * one of sixteen, and cannot check the delivery against the order without
 * doing the arithmetic in their head.
 *
 * The line already stores the pack as it was bought. The screen just never
 * said so.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));
vi.mock('../components/ItemSearch', () => ({ ItemSearch: () => null }));
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));

const packed = {
  id: 55,
  quantity: 420,
  received_quantity: 0,
  receive_status: 'pending',
  unit_cost: 1.976190,
  pack_name: 'Case',
  pack_size: '210.000000',
  pack_quantity: '2.000000',
  brand: 'Farm Fresh',
  inventory_item_id: 7,
  inventory_item: { id: 7, name: 'Egg', unit: 'pcs' },
};

// Bought loose, the way most lines are: nothing extra should appear.
const loose = {
  ...packed,
  id: 56,
  quantity: 3,
  unit_cost: 40,
  pack_name: null,
  pack_size: null,
  pack_quantity: null,
  brand: null,
  inventory_item_id: 8,
  inventory_item: { id: 8, name: 'Butter', unit: 'kg' },
};

const ordered = {
  id: 1,
  purchase_number: 'PO-0001',
  supplier_id: 1,
  supplier: { id: 1, name: 'The Royal Bakery' },
  status: 'ordered',
  total: 950,
  subtotal: 950,
  purchase_date: '2026-09-07',
  created_at: '2026-09-07T00:00:00Z',
  items: [packed, loose],
  can_edit: false,
  can_cancel: true,
  can_delete: false,
  can_undo_receipt: false,
};

const fetchPurchases = vi.fn();

vi.mock('../api', () => ({
  fetchPurchases: (...a: unknown[]) => fetchPurchases(...a),
  cancelPurchase: vi.fn(),
  deletePurchase: vi.fn(),
  updatePurchaseLines: vi.fn(),
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
  getPurchaseUnits: vi.fn().mockResolvedValue({ base_unit: 'kg', purchase_units: [] }),
  createPurchaseUnit: vi.fn(),
  createInventoryItem: vi.fn(),
}));

async function openTheOrder() {
  render(<MemoryRouter><PurchaseOrdersPage /></MemoryRouter>);
  fireEvent.click(await screen.findByText('PO-0001'));
  return screen.getByRole('dialog');
}

describe('Pack details on the receive modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPurchases.mockResolvedValue({
      purchases: { data: [ordered], current_page: 1, last_page: 1, total: 1 },
    });
  });

  it('says what one pack is, and what was ordered in boxes', async () => {
    const dialog = await openTheOrder();

    expect(within(dialog).getByTestId('pack-of-55')).toHaveTextContent('Farm Fresh · Case of 210 pcs');
    // The number stays in base units — that is what the server takes — with
    // the box count beside it.
    expect(within(dialog).getByTestId('ordered-packs-55')).toHaveTextContent('2 × Case');
    expect(within(dialog).getByText('420 pcs')).toBeTruthy();
  });

  it('turns what is being received into boxes as it is typed', async () => {
    const dialog = await openTheOrder();
    const inputs = within(dialog).getAllByRole('spinbutton');

    fireEvent.change(inputs[0], { target: { value: '210' } });
    expect(within(dialog).getByTestId('receiving-packs-55')).toHaveTextContent('= 1 × Case');

    // Half a case short: the remainder is what makes a miscount visible.
    fireEvent.change(inputs[0], { target: { value: '315' } });
    expect(within(dialog).getByTestId('receiving-packs-55')).toHaveTextContent('= 1 × Case + 105 pcs');
  });

  it('leaves a line bought loose alone', async () => {
    const dialog = await openTheOrder();

    expect(within(dialog).queryByTestId('pack-of-56')).toBeNull();
    expect(within(dialog).queryByTestId('ordered-packs-56')).toBeNull();
    expect(within(dialog).getByText('3 kg')).toBeTruthy();
  });
});
