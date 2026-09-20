import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SupplierProfilePage from '../pages/SupplierProfilePage';

/*
 * Owner, 2026-09-20: "in suppliers list, when clicked, can u add advanced
 * features to know all the po and items bought from each supplier".
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
let perms: string[] = ['suppliers.purchases', 'suppliers.manage', 'reports.financial'];
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: (p: string) => perms.includes(p), loading: false, user: null }),
}));

const fetchSupplierOverview = vi.fn();
const fetchSupplierItems = vi.fn();
const fetchSupplierRatings = vi.fn();
const fetchItemPriceHistory = vi.fn();
vi.mock('../api/purchasing', () => ({
  fetchSupplierOverview: (...a: unknown[]) => fetchSupplierOverview(...a),
  fetchSupplierItems: (...a: unknown[]) => fetchSupplierItems(...a),
  fetchSupplierRatings: (...a: unknown[]) => fetchSupplierRatings(...a),
  fetchItemPriceHistory: (...a: unknown[]) => fetchItemPriceHistory(...a),
  recordPurchasePayment: (...a: unknown[]) => recordPurchasePayment(...a),
  clearPurchasePayment: vi.fn().mockResolvedValue({ message: '' }),
}));
const recordPurchasePayment = vi.fn();
const createPurchaseFromSuggest = vi.fn();
const fetchPurchases = vi.fn();
const rateSupplier = vi.fn();
const updateSupplier = vi.fn();
vi.mock('../api', () => ({
  fetchPurchases: (...a: unknown[]) => fetchPurchases(...a),
  createPurchaseFromSuggest: (...a: unknown[]) => createPurchaseFromSuggest(...a),
  rateSupplier: (...a: unknown[]) => rateSupplier(...a),
  updateSupplier: (...a: unknown[]) => updateSupplier(...a),
}));

const agora = {
  id: 7, name: 'Agora', contact_name: 'Ali', phone: '3330000', extra_phones: ['7770000'], email: null, address: null, tin: null,
  payment_terms: 'Cash on delivery', lead_days: 2, bank_name: 'BML', bank_account_name: 'Ali Hassan', bank_account_number: '7730000123456',
  notes: 'Closed Fridays', is_active: true,
};
const overview = {
  supplier: agora,
  owed: { amount: 230, orders: 2, oldest_date: '2026-08-21' },
  orders: {
    count: 3, spend: 330, average: 110, first_date: '2026-07-22', last_date: '2026-09-18', days_between: 29,
    on_time: { on_time: 2, timed: 2, rate: 100 }, by_status: { draft: 1, ordered: 1, partial: 0, received: 2, cancelled: 1 }, open: 1,
  },
  items: { count: 2, top: [{ item_id: 1, name: 'Flour', spend: 270, orders: 3 }, { item_id: 2, name: 'Eggs', spend: 60, orders: 1 }] },
  monthly: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, spend: i === 8 ? 330 : 0, orders: i === 8 ? 3 : 0 })),
  ratings: { count: 1, quality: 5, delivery: 3, accuracy: 4, price: 4, overall: 4 },
};
const items = [
  {
    item_id: 1, name: 'Flour', unit: 'kg', photo_url: null, is_active: true, orders: 3, quantity: 25, spend: 270,
    first: { price: 10, date: '2026-07-22' }, last: { price: 12, date: '2026-09-18', brand: 'Pillsbury', purchase_number: 'PO-3', quantity: 5 },
    change_pct: 20, elsewhere: { supplier: 'Fahi Store', price: 11.5, date: '2026-09-15', cheaper: true },
    points: [{ date: '2026-07-22', price: 10, brand: null, purchase_number: 'PO-1' }, { date: '2026-09-18', price: 12, brand: 'Pillsbury', purchase_number: 'PO-3' }],
  },
  {
    item_id: 2, name: 'Eggs', unit: 'pcs', photo_url: null, is_active: true, orders: 1, quantity: 30, spend: 60,
    first: { price: 2, date: '2026-08-21' }, last: { price: 2, date: '2026-08-21', brand: null, purchase_number: 'PO-2', quantity: 30 },
    change_pct: null, elsewhere: { supplier: 'Fahi Store', price: 2.5, date: '2026-09-15', cheaper: false },
    points: [{ date: '2026-08-21', price: 2, brand: null, purchase_number: 'PO-2' }],
  },
];
const orders = {
  purchases: {
    current_page: 1, last_page: 1, total: 3,
    data: [
      { id: 3, purchase_number: 'PO-3', supplier_id: 7, status: 'ordered', total: 60, paid_amount: 0, owed: 60, payment_status: 'unpaid', purchase_date: '2026-09-18', created_at: '', items: [{ id: 1, quantity: 5, received_quantity: 0, receive_status: 'pending', unit_cost: 12, inventory_item: { id: 1, name: 'Flour' } }] },
      { id: 2, purchase_number: 'PO-2', supplier_id: 7, status: 'received', total: 170, paid_amount: 0, owed: 170, payment_status: 'unpaid', purchase_date: '2026-08-21', created_at: '', actual_delivery_date: '2026-08-22', items: [] },
      { id: 5, purchase_number: 'PO-5', supplier_id: 7, status: 'cancelled', total: 180, paid_amount: 0, owed: 0, payment_status: 'none', purchase_date: '2026-08-31', created_at: '', items: [] },
    ],
  },
};

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><SupplierProfilePage supplierId={7} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  perms = ['suppliers.purchases', 'suppliers.manage', 'reports.financial'];
  vi.clearAllMocks();
  fetchSupplierOverview.mockResolvedValue(overview);
  fetchSupplierItems.mockResolvedValue({ supplier: agora, items });
  fetchSupplierRatings.mockResolvedValue({ data: [{ id: 1, quality_score: 5, delivery_score: 3, accuracy_score: 4, price_score: 4, overall: 4, notes: 'Good flour', purchase: null, rated_by: 'Owner', created_at: '2026-09-01T10:00:00Z' }] });
  fetchItemPriceHistory.mockResolvedValue({ item: { id: 1, name: 'Flour', unit: 'kg', photo_url: null }, points: [
    { date: '2026-07-22', price: 10, supplier: 'Agora', brand: null, purchase_id: 1, purchase_number: 'PO-1' },
    { date: '2026-09-15', price: 11.5, supplier: 'Fahi Store', brand: null, purchase_id: 9, purchase_number: 'PO-F' },
    { date: '2026-09-18', price: 12, supplier: 'Agora', brand: 'Pillsbury', purchase_id: 3, purchase_number: 'PO-3' },
  ] });
  fetchPurchases.mockResolvedValue(orders);
  recordPurchasePayment.mockResolvedValue({ message: 'Marked as paid.', purchase: {} });
  createPurchaseFromSuggest.mockResolvedValue({ purchase: { id: 9, purchase_number: 'PO-9' } });
  rateSupplier.mockResolvedValue({ rating: {} });
  updateSupplier.mockResolvedValue({ supplier: agora });
});

describe('SupplierProfilePage', () => {
  it('opens on the overview: who they are, how much, how often, on time, top items', async () => {
    mount();
    const head = await screen.findByTestId('supplier-head');
    expect(within(head).getByText('Agora')).toBeInTheDocument();
    expect(within(head).getByText('7730000123456')).toBeInTheDocument();
    expect(within(head).getByText('1 open order')).toBeInTheDocument();

    const ov = await screen.findByTestId('supplier-overview');
    expect(within(ov).getByText('MVR 330.00')).toBeInTheDocument();
    expect(within(ov).getByText('3 orders placed')).toBeInTheDocument();
    expect(within(ov).getByText('Every 29 days')).toBeInTheDocument();
    expect(within(ov).getByText('100%')).toBeInTheDocument();
    const top = within(ov).getByTestId('supplier-top-items');
    expect(within(top).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Flour · MVR 270.00 · 3 orders', 'Eggs · MVR 60.00 · 1 order',
    ]);
    expect(within(ov).getByTestId('supplier-monthly').children).toHaveLength(12);
    expect(fetchSupplierOverview).toHaveBeenCalledWith(7);
  });

  it('Purchase orders lists every order for this supplier, totals the placed ones, and narrows by status', async () => {
    mount();
    await screen.findByTestId('supplier-head');
    fireEvent.click(screen.getByRole('tab', { name: 'Purchase orders' }));

    await waitFor(() => expect(fetchPurchases).toHaveBeenCalledWith(expect.objectContaining({ supplier_id: 7, page: 1 })));
    const tab = await screen.findByTestId('supplier-orders');
    expect(await within(tab).findByText('PO-3')).toBeInTheDocument();
    expect(within(tab).getByText('PO-5')).toBeInTheDocument();
    // 60 + 170; the cancelled 180 is not money.
    expect(within(tab).getByTestId('supplier-orders-total').textContent).toBe('MVR 230.00');
    expect(within(tab).getByText('PO-3').closest('a')?.getAttribute('href')).toBe('/purchasing/orders?search=PO-3');

    fireEvent.change(within(tab).getByLabelText('Status'), { target: { value: 'received' } });
    await waitFor(() => expect(fetchPurchases).toHaveBeenCalledWith(expect.objectContaining({ supplier_id: 7, status: 'received' })));
  });

  it('Items bought says how often, what it cost first and last, and who is cheaper; a row opens the price line', async () => {
    mount();
    await screen.findByTestId('supplier-head');
    fireEvent.click(screen.getByRole('tab', { name: 'Items bought' }));

    const table = await screen.findByTestId('supplier-items-table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Flour');
    expect(rows[0].textContent).toContain('MVR 12.00');
    expect(rows[0].textContent).toContain('MVR 10.00');
    expect(rows[0].textContent).toContain('+20.0%');
    expect(rows[0].textContent).toContain('MVR 11.50 cheaper');
    expect(rows[0].textContent).toContain('Fahi Store');
    expect(rows[1].textContent).toContain('first buy');
    expect(rows[1].textContent).not.toContain('cheaper');
    expect(screen.getByText('1 cheaper elsewhere')).toBeInTheDocument();

    fireEvent.click(within(rows[0]).getByText('Flour'));
    const dialog = await screen.findByRole('dialog');
    // This shop's own line first, drawn from its order lines — no fetch needed.
    await within(dialog).findByTestId('price-history-chart');
    expect(within(dialog).getByText('PO-1')).toBeInTheDocument();
    expect(within(dialog).queryByText('PO-F')).toBeNull();
    expect(fetchItemPriceHistory).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Every supplier' }));
    await waitFor(() => expect(fetchItemPriceHistory).toHaveBeenCalledWith(1));
    expect(await within(dialog).findByText('PO-F')).toBeInTheDocument();
  });

  it('Ratings shows past ratings and submits a new one', async () => {
    mount();
    await screen.findByTestId('supplier-head');
    fireEvent.click(screen.getByRole('tab', { name: 'Ratings' }));
    const tab = await screen.findByTestId('supplier-ratings');
    expect(await within(tab).findByText('Good flour')).toBeInTheDocument();

    fireEvent.click(within(tab).getByRole('radio', { name: 'Quality 5' }));
    fireEvent.click(within(tab).getByRole('radio', { name: 'Price 2' }));
    fireEvent.change(within(tab).getByLabelText('Rating notes'), { target: { value: 'Late twice' } });
    fireEvent.click(within(tab).getByRole('button', { name: 'Submit rating' }));
    await waitFor(() => expect(rateSupplier).toHaveBeenCalledWith(7, { quality_score: 5, delivery_score: 3, accuracy_score: 3, price_score: 2, notes: 'Late twice' }));
  });

  it('Ratings is not offered to someone who cannot manage suppliers', async () => {
    perms = ['suppliers.purchases'];
    mount();
    await screen.findByTestId('supplier-head');
    expect(screen.queryByRole('tab', { name: 'Ratings' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('Details saves payment terms, lead days and notes', async () => {
    mount();
    await screen.findByTestId('supplier-head');
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }));
    const tab = await screen.findByTestId('supplier-details');
    expect(within(tab).getByText('3330000 · 7770000')).toBeInTheDocument();
    const notes = within(tab).getByLabelText('Notes') as HTMLTextAreaElement;
    expect(notes.value).toBe('Closed Fridays');
    fireEvent.change(notes, { target: { value: 'Closed Fridays. Ask for Ali.' } });
    fireEvent.change(within(tab).getByLabelText('Days from order to delivery'), { target: { value: '3' } });
    fireEvent.click(within(tab).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateSupplier).toHaveBeenCalledWith(7, { notes: 'Closed Fridays. Ask for Ali.', payment_terms: 'Cash on delivery', lead_days: 3 }));
    expect(await within(tab).findByText('Saved.')).toBeInTheDocument();
  });
  // Owner, 2026-09-21: close the buying loop.
  it('says what is owed, records a payment against an order, and shows it paid', async () => {
    mount();
    const head = await screen.findByTestId('supplier-head');
    expect(within(head).getByTestId('supplier-owed').textContent).toContain('Owed MVR 230.00 · 2 orders');

    fireEvent.click(screen.getByRole('tab', { name: 'Purchase orders' }));
    const tab = await screen.findByTestId('supplier-orders');
    await within(tab).findByText('PO-3');
    expect(within(tab).getByTestId('supplier-orders-owed').textContent).toBe('MVR 230.00 owed');
    expect(within(tab).getByTestId('paid-3').textContent).toBe('unpaid');

    fireEvent.click(within(tab).getAllByRole('button', { name: 'Record payment' })[0]);
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText('Amount (MVR)') as HTMLInputElement).value).toBe('60.00');
    fireEvent.change(within(dialog).getByLabelText('How'), { target: { value: 'transfer' } });
    fireEvent.change(within(dialog).getByLabelText('Reference (optional)'), { target: { value: 'BML 1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark paid' }));
    await waitFor(() => expect(recordPurchasePayment).toHaveBeenCalledWith(3, expect.objectContaining({ amount: 60, method: 'transfer', reference: 'BML 1' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // A smaller amount is a part payment; more than is owed cannot be sent.
    fireEvent.click(within(tab).getAllByRole('button', { name: 'Record payment' })[0]);
    const again = await screen.findByRole('dialog');
    fireEvent.change(within(again).getByLabelText('Amount (MVR)'), { target: { value: '25' } });
    expect(await within(again).findByRole('button', { name: /Record part payment/ })).toBeEnabled();
    fireEvent.change(within(again).getByLabelText('Amount (MVR)'), { target: { value: '999' } });
    // Above what is owed the button cannot be pressed at all.
    await waitFor(() => expect(within(again).getByRole('button', { name: /Mark paid/ })).toBeDisabled());
  });

  it('orders picked items again at the last quantity and price, then opens the new order', async () => {
    mount();
    await screen.findByTestId('supplier-head');
    fireEvent.click(screen.getByRole('tab', { name: 'Items bought' }));
    await screen.findByTestId('supplier-items-table');
    expect(screen.getByRole('button', { name: /Order again/ })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Pick Flour'));
    fireEvent.click(screen.getByRole('button', { name: 'Order again (1)' }));
    await waitFor(() => expect(createPurchaseFromSuggest).toHaveBeenCalledWith(expect.objectContaining({
      supplier_id: 7,
      items: [{ inventory_item_id: 1, quantity: 5, unit_cost: 12 }],
    })));
  });
});
