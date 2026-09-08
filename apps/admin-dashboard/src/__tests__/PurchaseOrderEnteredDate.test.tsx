import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PurchaseOrdersPage } from '../pages/PurchaseOrdersPage';

/*
 * Owner, 2026-09-07: "many time we enter PO back date, can u add actual date
 * column?"
 *
 * The PO date is whatever was typed, so it cannot say when the order was
 * really entered. created_at can. And the PO date itself was being printed
 * straight from a `date` cast, which serialises midnight in the app's
 * timezone: a purchase dated 2026-09-01 arrived as
 * "2026-08-31T19:00:00.000000Z" and the list showed the day before the one
 * that was typed.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: () => true, loading: false, user: null }),
}));
vi.mock('../components/ScanSheet', () => ({ ScanSheet: () => null }));
vi.mock('../components/ItemSearch', () => ({ ItemSearch: () => null }));

let mobile = false;
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => mobile }));

const po = (over: Record<string, unknown>) => ({
  id: 1,
  purchase_number: 'PO-20260906-0001',
  supplier_id: 1,
  supplier: { id: 1, name: 'Bazaaru' },
  status: 'received',
  total: 60,
  subtotal: 60,
  // The date-only shape the API sends now.
  purchase_date: '2026-09-01',
  // Typed up at 20:20 on the evening of the 6th, local time — expressed as
  // the UTC instant the server would send, so this reads the same in any
  // timezone the tests happen to run in.
  created_at: new Date(2026, 8, 6, 20, 20).toISOString(),
  items: [],
  can_edit: false,
  can_cancel: false,
  can_delete: false,
  can_undo_receipt: true,
  ...over,
});

const fetchPurchases = vi.fn();

vi.mock('../api', () => ({
  fetchPurchases: (...a: unknown[]) => fetchPurchases(...a),
  fetchSuppliers: vi.fn().mockResolvedValue({ data: [] }),
  getPurchaseSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
  getPurchaseUnits: vi.fn().mockResolvedValue({ base_unit: 'kg', purchase_units: [] }),
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

function show(rows: ReturnType<typeof po>[]) {
  fetchPurchases.mockResolvedValue({ purchases: { data: rows, current_page: 1, last_page: 1, total: rows.length } });
  render(<MemoryRouter><PurchaseOrdersPage /></MemoryRouter>);
}

describe('When a purchase order was actually entered', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mobile = false;
  });

  it('shows the day it was keyed in, and flags it as back-dated', async () => {
    show([po({})]);

    const cell = await screen.findByTestId('po-entered-1');
    expect(cell).toHaveTextContent('2026-09-06');
    expect(cell).toHaveTextContent('back-dated');
    // The exact moment is there for anyone who needs it.
    expect(cell).toHaveAttribute('title', '2026-09-06 20:20');
  });

  it('says nothing about back-dating when the two agree', async () => {
    show([po({ purchase_date: '2026-09-06' })]);

    const cell = await screen.findByTestId('po-entered-1');
    expect(cell).toHaveTextContent('2026-09-06');
    expect(cell).not.toHaveTextContent('back-dated');
  });

  it('prints the PO date as the day that was typed', async () => {
    show([po({})]);

    const row = (await screen.findByText('PO-20260906-0001')).closest('tr') as HTMLElement;
    expect(within(row).getByText('2026-09-01')).toBeInTheDocument();
    // Not the timezone-shifted timestamp the list used to show.
    expect(row.textContent).not.toContain('T19:00');
  });

  it('carries the same on a phone', async () => {
    mobile = true;
    show([po({})]);

    const line = await screen.findByTestId('po-entered-1');
    expect(line).toHaveTextContent('Entered 2026-09-06');
    expect(line).toHaveTextContent('back-dated');
  });

  it('copes with an order that has no dates at all', async () => {
    show([po({ purchase_date: null, created_at: null })]);

    await screen.findByText('PO-20260906-0001');
    // The column keeps its shape rather than collapsing the row.
    const cell = screen.getByTestId('po-entered-1');
    expect(cell).toHaveTextContent('—');
    expect(cell).not.toHaveTextContent('back-dated');
  });
});
