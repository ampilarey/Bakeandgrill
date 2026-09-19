import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PriceChangesPage from '../pages/PriceChangesPage';

/*
 * Owner, 2026-09-19: "Where i can see the price difference of each product
 * over time. An easy way to".
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
let mobile = false;
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => mobile }));

const fetchPriceChanges = vi.fn();
const fetchItemPriceHistory = vi.fn();
vi.mock('../api/purchasing', () => ({
  fetchPriceChanges: (...a: unknown[]) => fetchPriceChanges(...a),
  fetchItemPriceHistory: (...a: unknown[]) => fetchItemPriceHistory(...a),
}));

const flour = {
  item_id: 1, name: 'Flour', unit: 'kg', photo_url: null,
  last: { price: 13, date: '2026-09-17', supplier: 'Agora', brand: null },
  previous: { price: 11, date: '2026-08-30', supplier: 'Fahi Store', brand: null },
  month_ago: { price: 10, date: '2026-08-05', supplier: 'Agora', brand: null },
  change_pct: 18.2, change_pct_month: 30, purchases_90d: 3,
  sparkline: [{ date: '2026-08-05', price: 10 }, { date: '2026-08-30', price: 11 }, { date: '2026-09-17', price: 13 }],
};
const eggs = {
  item_id: 2, name: 'Eggs', unit: 'pcs', photo_url: null,
  last: { price: 2, date: '2026-09-18', supplier: 'Fahi Store', brand: null },
  previous: { price: 2.5, date: '2026-09-09', supplier: 'Agora', brand: null },
  month_ago: null, change_pct: -20, change_pct_month: null, purchases_90d: 2,
  sparkline: [{ date: '2026-09-09', price: 2.5 }, { date: '2026-09-18', price: 2 }],
};
const oil = {
  item_id: 3, name: 'Oil', unit: 'l', photo_url: null,
  last: { price: 30, date: '2026-09-14', supplier: 'Agora', brand: null },
  previous: null, month_ago: null, change_pct: null, change_pct_month: null, purchases_90d: 1,
  sparkline: [{ date: '2026-09-14', price: 30 }],
};

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><PriceChangesPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mobile = false;
  fetchPriceChanges.mockReset();
  fetchItemPriceHistory.mockReset();
  fetchPriceChanges.mockResolvedValue({
    items: [flour, eggs, oil],
    summary: { items: 3, up_over_10: 1, up: 1, down: 1, unchanged: 0, single_price: 1 },
  });
  fetchItemPriceHistory.mockResolvedValue({
    item: { id: 1, name: 'Flour', unit: 'kg', photo_url: null },
    points: [
      { date: '2026-08-05', price: 10, supplier: 'Agora', brand: null, purchase_id: 1, purchase_number: 'PO-1' },
      { date: '2026-08-30', price: 11, supplier: 'Fahi Store', brand: null, purchase_id: 2, purchase_number: 'PO-2' },
      { date: '2026-09-17', price: 13, supplier: 'Agora', brand: null, purchase_id: 3, purchase_number: 'PO-3' },
    ],
  });
});

describe('PriceChangesPage', () => {
  it('lists every item with its last price, the one before and the change, biggest rise first', async () => {
    mount();
    const table = await screen.findByTestId('price-change-table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['Flourper kg', 'Eggsper pcs', 'Oilper l']);

    expect(within(rows[0]).getByText('MVR 13.00')).toBeInTheDocument();
    expect(within(rows[0]).getByText('MVR 11.00')).toBeInTheDocument();
    expect(within(rows[0]).getAllByTestId('change-pct').map((n) => n.textContent)).toEqual(['+18.2%', '+30.0%']);
    expect(within(rows[1]).getAllByTestId('change-pct')[0].textContent).toBe('−20.0%');
    expect(within(rows[2]).getByText('first buy')).toBeInTheDocument();

    // The summary cards say how many went up 10% or more.
    expect(screen.getByText('Up 10% or more').parentElement?.parentElement?.textContent).toContain('1');
  });

  it('search and the went-up / went-down filters narrow the list', async () => {
    mount();
    await screen.findByTestId('price-change-table');

    fireEvent.click(screen.getByRole('button', { name: 'Went down' }));
    let rows = within(screen.getByTestId('price-change-table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Eggs');

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'oil' } });
    rows = within(screen.getByTestId('price-change-table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Oil');
  });

  it('opening a row shows the whole price line with who charged each price', async () => {
    mount();
    const table = await screen.findByTestId('price-change-table');
    fireEvent.click(within(table).getByText('Flour'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(fetchItemPriceHistory).toHaveBeenCalledWith(1));
    expect(await screen.findByTestId('price-history-chart')).toBeInTheDocument();
    const points = await screen.findByTestId('price-history-points');
    const pointRows = within(points).getAllByRole('row').slice(1);
    // Newest first in the list under the chart.
    expect(pointRows.map((r) => within(r).getAllByRole('cell')[2].textContent)).toEqual(['Agora', 'Fahi Store', 'Agora']);
    expect(pointRows.map((r) => within(r).getAllByRole('cell')[4].textContent)).toEqual(['PO-3', 'PO-2', 'PO-1']);
  });

  it('on a phone each item is a card that opens the same history', async () => {
    mobile = true;
    mount();
    const cards = await screen.findByTestId('price-change-cards');
    const buttons = within(cards).getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0].textContent).toContain('Flour');
    expect(buttons[0].textContent).toContain('was MVR 11.00');
    fireEvent.click(buttons[0]);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(fetchItemPriceHistory).toHaveBeenCalledWith(1));
  });

  it('says where prices come from when none are recorded yet', async () => {
    fetchPriceChanges.mockResolvedValue({ items: [], summary: { items: 0, up_over_10: 0, up: 0, down: 0, unchanged: 0, single_price: 0 } });
    mount();
    expect(await screen.findByText(/No prices recorded yet/)).toBeInTheDocument();
  });
});
