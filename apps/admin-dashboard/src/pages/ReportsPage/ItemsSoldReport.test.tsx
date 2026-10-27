import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemsSoldReport as Report } from '../../api';

/*
 * Owner, 2026-10-27: "how can i see all the items sold by a specific date and
 * specific time of preiod, with or without cattegory".
 */
const api = vi.hoisted(() => ({ fetchItemsSold: vi.fn(), fetchItemSales: vi.fn() }));
vi.mock('../../api', () => api);
const csv = vi.hoisted(() => ({ downloadCSV: vi.fn() }));
vi.mock('../../utils/csvExport', () => csv);
vi.mock('./ItemSalesView', () => ({
  ItemSalesView: (p: { itemId: number; variantId: number | null; title: string; initial: { from: string }; onClose: () => void }) => (
    <div data-testid="item-view">{p.title} · {p.itemId} · {String(p.variantId)} · {p.initial.from}<button type="button" onClick={p.onClose}>Close view</button></div>
  ),
}));

import { ItemsSoldReport } from './ItemsSoldReport';

const report = (): Report => ({
  range: { from: '2026-10-27', to: '2026-10-27', time_from: null, time_to: null },
  totals: { items: 3, qty: 14, sales: 140, orders: 6 },
  items: [
    { key: 'a', item_id: 1, variant_id: 5, name: 'Nescafé (Milk)', category_id: 2, category: 'Drinks › Hot', qty: 3, sales: 45, avg_price: 15, orders: 2, share: 32.1 },
    { key: 'b', item_id: 2, variant_id: null, name: 'Bajiya', category_id: 3, category: 'Snacks', qty: 10, sales: 50, avg_price: 5, orders: 3, share: 35.7 },
    { key: 'c', item_id: 3, variant_id: null, name: 'Black Tea', category_id: 2, category: 'Drinks › Hot', qty: 1, sales: 45, avg_price: 45, orders: 1, share: 32.1 },
  ],
  categories: [
    { category: 'Drinks › Hot', category_id: 2, items: 2, qty: 4, sales: 90, share: 64.3 },
    { category: 'Snacks', category_id: 3, items: 1, qty: 10, sales: 50, share: 35.7 },
  ],
  category_choices: [{ id: 1, name: 'Drinks' }, { id: 2, name: 'Drinks › Hot' }, { id: 3, name: 'Snacks' }],
  staff_choices: [{ id: 9, name: 'Aisha' }],
});

function renderAt(url = '/reports?tab=Items+Sold&from=2026-10-27&to=2026-10-27') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ItemsSoldReport /></QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ItemsSoldReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchItemsSold.mockImplementation(async () => report());
  });

  it('lists every item grouped by category with subtotals, or as one list', async () => {
    renderAt();
    const groups = await screen.findByTestId('items-sold-groups');
    expect(api.fetchItemsSold).toHaveBeenCalledWith({ from: '2026-10-27', to: '2026-10-27', time_from: null, time_to: null, category_id: null, user_id: null, type: null });
    expect(groups).toHaveTextContent('Drinks › Hot');
    expect(groups).toHaveTextContent('2 items · 4 sold');
    expect(groups).toHaveTextContent('MVR 90.00');
    expect(within(screen.getByTestId('items-sold-totals')).getByText('MVR 140.00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Drinks › Hot/ }));
    expect(groups).not.toHaveTextContent('Nescafé (Milk)');

    fireEvent.click(screen.getByRole('button', { name: 'One list' }));
    expect(screen.getAllByText('Nescafé (Milk)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Drinks › Hot').length).toBeGreaterThan(0);
  });

  it('opens with the times and category from the address, and asks again when they change', async () => {
    renderAt('/reports?tab=Items+Sold&from=2026-10-20&to=2026-10-27&time_from=15:00&time_to=18:00&category=1');
    await screen.findByTestId('items-sold-groups');
    expect(api.fetchItemsSold).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-10-20', to: '2026-10-27', time_from: '15:00', time_to: '18:00', category_id: 1 }));
    expect(screen.getByText(/3:00 PM to 6:00 PM on each day/)).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('items-sold-time_to'), { target: { value: '20:30' } });
    await waitFor(() => expect(api.fetchItemsSold).toHaveBeenLastCalledWith(expect.objectContaining({ time_to: '20:30' })));

    fireEvent.click(screen.getByRole('button', { name: 'Whole day' }));
    await waitFor(() => expect(api.fetchItemsSold).toHaveBeenLastCalledWith(expect.objectContaining({ time_from: null, time_to: null })));

    fireEvent.click(screen.getByRole('button', { name: 'Lunch' }));
    await waitFor(() => expect(api.fetchItemsSold).toHaveBeenLastCalledWith(expect.objectContaining({ time_from: '11:00', time_to: '14:59' })));

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '' } });
    await waitFor(() => expect(api.fetchItemsSold).toHaveBeenLastCalledWith(expect.objectContaining({ category_id: null })));
    fireEvent.change(screen.getByLabelText('Staff'), { target: { value: '9' } });
    await waitFor(() => expect(api.fetchItemsSold).toHaveBeenLastCalledWith(expect.objectContaining({ user_id: 9 })));
  });

  it('finds a dish, sorts, and exports what is shown', async () => {
    renderAt();
    await screen.findByTestId('items-sold-groups');
    fireEvent.click(screen.getByRole('button', { name: 'One list' }));
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'qty' } });
    const firstRow = () => screen.getAllByRole('row')[1];
    expect(firstRow()).toHaveTextContent('Bajiya');

    fireEvent.change(screen.getByLabelText('Find a dish'), { target: { value: 'tea' } });
    expect(screen.queryAllByText('Bajiya')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('items-sold-export'));
    expect(csv.downloadCSV).toHaveBeenCalledWith('items-sold-2026-10-27-to-2026-10-27', [
      expect.objectContaining({ Item: 'Black Tea', Category: 'Drinks › Hot', Sold: 1, Sales: '45.00' }),
    ]);
  });

  it('opens an item on its own page with its size and the same period, and closes it', async () => {
    renderAt();
    await screen.findByTestId('items-sold-groups');
    fireEvent.click(screen.getAllByTestId('items-sold-open-a')[0]);
    expect(await screen.findByTestId('item-view')).toHaveTextContent('Nescafé (Milk) · 1 · 5 · 2026-10-27');
    fireEvent.click(screen.getByRole('button', { name: 'Close view' }));
    expect(screen.queryByTestId('item-view')).toBeNull();
  });

  it('opens straight on an item from the address', async () => {
    renderAt('/reports?tab=Items+Sold&from=2026-10-27&to=2026-10-27&item=2&size=0');
    expect(await screen.findByTestId('item-view')).toHaveTextContent('Bajiya · 2 · 0');
  });
});
