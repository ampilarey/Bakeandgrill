import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemSalesReport } from '../../api';

/*
 * Owner, 2026-10-27: "When i select an item, which time this item is bought in a
 * graph and different forms and different times, dates, months".
 */
const api = vi.hoisted(() => ({ fetchItemSales: vi.fn() }));
vi.mock('../../api', () => api);

import { ItemSalesView } from './ItemSalesView';

const cell = (qty: number) => ({ qty, sales: qty * 15, orders: qty });
const report = (): ItemSalesReport => ({
  item: { id: 1, name: 'Nescafé', category: 'Drinks', sizes: [{ id: 4, name: 'Black (PKT)', price: 10, active: true }, { id: 5, name: 'Milk', price: 15, active: true }] },
  range: { from: '2026-10-21', to: '2026-10-27', days: 7, group: 'day' },
  previous: { from: '2026-10-14', to: '2026-10-20' },
  totals: { qty: 70, sales: 1050, orders: 50, avg_price: 15, per_day: 10, per_order: 1.4 },
  previous_totals: { qty: 50, sales: 750, orders: 40, avg_price: 15, per_day: 7.1, per_order: 1.25 },
  series: Array.from({ length: 7 }, (_, i) => ({ key: `d${i}`, from: `2026-10-2${i + 1}`, to: `2026-10-2${i + 1}`, sales: 150, items: 10, orders: 7, avg_order: 15, net: 150, refunds: 0, discounts: 0, tax: 0 })),
  previous_series: Array.from({ length: 7 }, (_, i) => ({ key: `p${i}`, from: `2026-10-1${i + 4}`, to: `2026-10-1${i + 4}`, sales: 100, items: 7, orders: 5, avg_order: 15, net: 100, refunds: 0, discounts: 0, tax: 0 })),
  by_hour: Array.from({ length: 24 }, (_, h) => cell(h === 9 ? 30 : h > 7 && h < 22 ? 3 : 0)),
  by_weekday: Array.from({ length: 7 }, (_, d) => cell(d === 4 ? 20 : 8)),
  heatmap: Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => cell(d === 4 && h === 9 ? 12 : h > 7 && h < 22 ? 1 : 0))),
  by_size: [{ key: '5', label: 'Milk', qty: 60, sales: 900, orders: 40 }, { key: '4', label: 'Black (PKT)', qty: 10, sales: 100, orders: 10 }],
  by_type: [{ key: 'dine_in', label: 'dine_in', qty: 50, sales: 750, orders: 35 }, { key: 'takeaway', label: 'takeaway', qty: 20, sales: 300, orders: 15 }],
  by_staff: [{ key: 'none', label: 'Online (no staff)', qty: 20, sales: 300, orders: 15 }],
});

const initial = { from: '2026-10-21', to: '2026-10-27', time_from: '15:00', time_to: '18:00', user_id: null, type: null };

function renderIt(variantId: number | null = 5) {
  const onClose = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ItemSalesView itemId={1} variantId={variantId} title="Nescafé (Milk)" initial={initial} onClose={onClose} /></QueryClientProvider>);
  return onClose;
}

describe('ItemSalesView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchItemSales.mockImplementation(async () => report());
  });

  it('opens on the size and the period it came from, and shows when it sells', async () => {
    renderIt();
    await screen.findByTestId('item-sales-hours');
    expect(api.fetchItemSales).toHaveBeenCalledWith(1, expect.objectContaining({ from: '2026-10-21', to: '2026-10-27', variant_id: 5, time_from: '15:00', time_to: '18:00', group: 'day' }));
    expect(screen.getByTestId('item-sales-sold')).toHaveTextContent('70');
    expect(screen.getByTestId('item-sales-sold')).toHaveTextContent('+40.0% on before');
    expect(screen.getByTestId('item-sales-hours-tip')).toHaveTextContent('30 sold · 9 AM');
    expect(screen.getByTestId('item-sales-weekdays-tip')).toHaveTextContent('20 sold · Friday');
    expect(screen.getByRole('dialog')).toHaveTextContent('Nescafé (Milk)');
    expect(screen.getByTestId('item-sales-heat-tip')).toHaveTextContent('Busiest: Fri 9 AM');
    expect(screen.getByText('By size')).toBeInTheDocument();
    expect(screen.getByText('Takeaway')).toBeInTheDocument();
    expect(screen.getByTestId('item-sales-range')).toHaveTextContent('15:00 to 18:00 each day');
  });

  it('switches size, count or money, period and grouping', async () => {
    renderIt();
    await screen.findByTestId('item-sales-hours');
    fireEvent.click(screen.getByRole('button', { name: 'Every size' }));
    await waitFor(() => expect(api.fetchItemSales).toHaveBeenLastCalledWith(1, expect.objectContaining({ variant_id: null })));

    fireEvent.click(screen.getByRole('button', { name: 'Sales (MVR)' }));
    expect(screen.getByTestId('item-sales-hours-tip')).toHaveTextContent('MVR 450.00 · 9 AM');

    fireEvent.click(screen.getByRole('button', { name: 'Last 12 months' }));
    await waitFor(() => expect(api.fetchItemSales).toHaveBeenLastCalledWith(1, expect.objectContaining({ group: 'month' })));
    fireEvent.click(screen.getByRole('button', { name: 'Weeks' }));
    await waitFor(() => expect(api.fetchItemSales).toHaveBeenLastCalledWith(1, expect.objectContaining({ group: 'week' })));
    expect(screen.getByRole('button', { name: 'Hours' })).toBeDisabled();
  });

  it('reads a column by focus and closes', async () => {
    const onClose = renderIt(null);
    const hours = await screen.findByTestId('item-sales-hours');
    fireEvent.focus(within(hours).getByRole('button', { name: /^3 PM/ }));
    expect(screen.getByTestId('item-sales-hours-tip')).toHaveTextContent('3 sold · 3 PM');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
