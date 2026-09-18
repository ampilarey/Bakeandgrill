import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PurchaseOrdersPage } from '../pages/PurchaseOrdersPage';
import { describePack } from '../utils/packDetails';

/*
 * Owner, 2026-09-18 (screenshot of the receive modal on a phone): five
 * columns ran off the right edge, so the receiving box was half hidden and
 * the status column never seen; and "Packet of 2Kg of 2000 g" read twice
 * over. On a phone each line is a card with the box full width.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));
vi.mock('../components/ItemSearch', () => ({ ItemSearch: () => null }));
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => true }));

const packed = {
  id: 55, quantity: 2000, received_quantity: 0, receive_status: 'pending', unit_cost: 0.1,
  pack_name: 'Packet of 2Kg', pack_size: '2000.000000', pack_quantity: '1.000000', brand: 'BRZ',
  inventory_item_id: 7, inventory_item: { id: 7, name: 'Chicken Breast', unit: 'g' },
};

const ordered = {
  id: 1, purchase_number: 'PO-0001', supplier_id: 1, supplier: { id: 1, name: 'Frez' },
  status: 'ordered', total: 525.28, subtotal: 525.28, purchase_date: '2026-09-18', created_at: '2026-09-18T00:00:00Z',
  items: [packed], can_edit: false, can_cancel: true, can_delete: false, can_undo_receipt: false,
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

describe('Receiving on a phone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPurchases.mockResolvedValue({ purchases: { data: [ordered], current_page: 1, last_page: 1, total: 1 } });
  });

  it('lays each line out as a card with the receiving box full width and the status in view', async () => {
    render(<MemoryRouter><PurchaseOrdersPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('PO-0001'));
    const dialog = screen.getByRole('dialog');

    const cards = within(dialog).getByTestId('receive-lines-mobile');
    expect(within(dialog).queryByRole('table')).toBeNull();
    expect(cards).toHaveTextContent('Chicken Breast');
    expect(within(cards).getByTestId('pack-of-55')).toHaveTextContent('BRZ · Packet of 2Kg (2000 g)');
    expect(within(cards).getByTestId('ordered-packs-55')).toHaveTextContent('1 × Packet of 2Kg');
    expect(cards).toHaveTextContent('pending');

    const box = within(cards).getByRole('spinbutton', { name: /Receiving now/ });
    fireEvent.change(box, { target: { value: '2000' } });
    expect(within(cards).getByTestId('receiving-packs-55')).toHaveTextContent('= 1 × Packet of 2Kg');
  });
});

describe('describePack', () => {
  it('does not say "of" twice when the pack name already does', () => {
    expect(describePack({ pack_name: 'Packet of 2Kg', pack_size: 2000 }, 'g')).toBe('Packet of 2Kg (2000 g)');
    expect(describePack({ pack_name: 'Tin of 100ml', pack_size: 100 }, 'ml')).toBe('Tin of 100ml (100 ml)');
    expect(describePack({ pack_name: 'Case', pack_size: 210 }, 'pcs')).toBe('Case of 210 pcs');
    expect(describePack({ pack_name: 'Coffee bag', pack_size: 500 }, 'g')).toBe('Coffee bag of 500 g');
  });
});
