import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalesTrend } from '../../api';

/*
 * Owner, 2026-10-27: "Can u enhance the admin dash board. This is how Loyverse
 * dashboard is. But no need to be exact like that. I need more advanced
 * graphics and features and animations".
 */
const api = vi.hoisted(() => ({ fetchSalesTrend: vi.fn() }));
vi.mock('../../api', () => api);

import { SalesInsights } from './SalesInsights';
import { change, compact, defaultGroup, niceTicks, presetRange, shiftRange, spanDays, toCsv } from './salesInsightsMath';

const fig = (sales: number, orders: number) => ({ sales, refunds: 10, discounts: 5, tax: 8, net: sales - 18, orders, avg_order: orders ? sales / orders : 0, items: orders * 2 });
const trend = (over: Partial<SalesTrend> = {}): SalesTrend => ({
  range: { from: '2026-10-21', to: '2026-10-27', days: 7, group: 'day' },
  previous: { from: '2026-10-14', to: '2026-10-20' },
  totals: fig(1100, 20),
  previous_totals: fig(1000, 25),
  series: Array.from({ length: 7 }, (_, i) => ({ key: `2026-10-2${i + 1}`, from: `2026-10-2${i + 1}`, to: `2026-10-2${i + 1}`, ...fig(100 + i * 20, 3) })),
  previous_series: Array.from({ length: 7 }, (_, i) => ({ key: `2026-10-1${i + 4}`, from: `2026-10-1${i + 4}`, to: `2026-10-1${i + 4}`, ...fig(90, 3) })),
  heatmap: Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => ({ sales: d === 4 && h === 20 ? 500 : h > 8 ? 50 : 0, orders: h > 8 ? 1 : 0 }))),
  by_type: [{ type: 'dine_in', orders: 12, sales: 700 }, { type: 'takeaway', orders: 8, sales: 400 }],
  by_payment: [{ method: 'cash', orders: 10, amount: 600 }, { method: 'customer_deposit', orders: 2, amount: 100 }],
  by_staff: [{ user_id: 2, name: 'Aisha', orders: 12, sales: 700 }, { user_id: null, name: 'Online (no staff)', orders: 8, sales: 400 }],
  top_items: [{ key: '1:0:', name: 'Nescafé (Milk)', qty: 30, sales: 450 }],
  staff: [{ id: 2, name: 'Aisha' }],
  ...over,
});

function renderIt() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SalesInsights /></QueryClientProvider>);
}

describe('SalesInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchSalesTrend.mockImplementation(async () => trend());
  });

  it('opens on today by hour and shows every figure against the period before', async () => {
    renderIt();
    await screen.findByTestId('si-tile-sales');
    expect(api.fetchSalesTrend).toHaveBeenCalledWith(expect.objectContaining({ group: 'hour', from: presetRange('today').from, to: presetRange('today').to }));
    const sales = screen.getByTestId('si-tile-sales');
    await waitFor(() => expect(sales).toHaveTextContent('1,100.00'));
    expect(sales).toHaveTextContent('+10.0% · +MVR 100.00');
    // Fewer orders than before reads red; more refunds would too.
    expect(screen.getByTestId('si-tile-orders')).toHaveTextContent('−20.0% · −5');
    expect(screen.getByTestId('si-compare-line')).toHaveTextContent('14 Oct – 20 Oct 2026');
  });

  it('picks a period, steps it with the arrows and filters by time of day, staff and type', async () => {
    renderIt();
    await screen.findByTestId('si-tile-sales');
    fireEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));
    await waitFor(() => expect(api.fetchSalesTrend).toHaveBeenLastCalledWith(expect.objectContaining({ ...presetRange('last_30'), group: 'day' })));

    fireEvent.click(screen.getByRole('button', { name: 'Earlier' }));
    await waitFor(() => expect(api.fetchSalesTrend).toHaveBeenLastCalledWith(expect.objectContaining(shiftRange(presetRange('last_30'), -1))));
    expect(screen.getByRole('button', { name: 'Pick dates' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(screen.getByLabelText('Time of day'), { target: { value: 'lunch' } });
    await waitFor(() => expect(api.fetchSalesTrend).toHaveBeenLastCalledWith(expect.objectContaining({ hour_from: 11, hour_to: 14 })));
    fireEvent.change(screen.getByLabelText('Staff'), { target: { value: '2' } });
    await waitFor(() => expect(api.fetchSalesTrend).toHaveBeenLastCalledWith(expect.objectContaining({ user_id: 2 })));
    fireEvent.change(screen.getByLabelText('Order type'), { target: { value: 'takeaway' } });
    await waitFor(() => expect(api.fetchSalesTrend).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'takeaway' })));
  });

  it('switches the chart between figures, groupings and shapes, and hides the period before', async () => {
    renderIt();
    await screen.findByTestId('si-tile-sales');
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await waitFor(() => expect(screen.getByText('Sales by day')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('si-tile-orders'));
    expect(screen.getByText('Orders by day')).toBeInTheDocument();
    expect(screen.getByTestId('si-tile-orders')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Weeks' }));
    await waitFor(() => expect(api.fetchSalesTrend).toHaveBeenLastCalledWith(expect.objectContaining({ group: 'week' })));

    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    expect(screen.getByTestId('si-chart').querySelectorAll('path.si-grow').length).toBeGreaterThan(0);
    expect(screen.getByTestId('si-prev-line')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('si-compare'));
    expect(screen.queryByTestId('si-prev-line')).toBeNull();
  });

  it('reads a point with the keyboard, both periods in the tooltip', async () => {
    renderIt();
    const chart = await screen.findByTestId('si-chart');
    const svg = chart.querySelector('svg')!;
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    const tip = await screen.findByTestId('si-tip');
    expect(tip).toHaveTextContent('MVR 100.00');
    expect(tip).toHaveTextContent('MVR 90.00');
    expect(tip).toHaveTextContent('+11.1%');
    fireEvent.keyDown(svg, { key: 'Escape' });
    expect(screen.queryByTestId('si-tip')).toBeNull();
  });

  it('names the busiest hour and splits the money in plain words', async () => {
    renderIt();
    await screen.findByTestId('si-heatmap');
    expect(screen.getByTestId('si-heat-tip')).toHaveTextContent('Busiest: Fri 8 PM');
    expect(within(screen.getByTestId('si-by-type')).getByText('Dine in')).toBeInTheDocument();
    expect(within(screen.getByTestId('si-by-payment')).getByText('Wallet')).toBeInTheDocument();
    expect(within(screen.getByTestId('si-by-staff')).getByText('Online (no staff)')).toBeInTheDocument();
    expect(within(screen.getByTestId('si-top-items')).getByText('Nescafé (Milk)')).toBeInTheDocument();
  });

  it('keeps the table short until asked, and exports it', async () => {
    api.fetchSalesTrend.mockImplementation(async () => trend({
      series: Array.from({ length: 20 }, (_, i) => ({ key: `k${i}`, from: '2026-10-01', to: '2026-10-01', ...fig(10, 1) })),
    }));
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    renderIt();
    const table = await screen.findByTestId('si-table');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(7);
    fireEvent.click(screen.getByTestId('si-table-more'));
    expect(table.querySelectorAll('tbody tr')).toHaveLength(20);
    fireEvent.click(screen.getByTestId('si-export'));
    expect(createObjectURL).toHaveBeenCalled();
  });
});

describe('sales insights maths', () => {
  const now = new Date('2026-10-27T15:00:00');

  it('works out the periods and steps them', () => {
    expect(presetRange('today', now)).toEqual({ from: '2026-10-27', to: '2026-10-27' });
    expect(presetRange('this_week', now)).toEqual({ from: '2026-10-26', to: '2026-10-27' });
    expect(presetRange('last_month', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(spanDays(presetRange('last_30', now))).toBe(30);
    // A calendar month steps by months; anything else by its own length, never past today.
    expect(shiftRange(presetRange('this_month', now), -1, now)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(shiftRange({ from: '2026-10-20', to: '2026-10-26' }, 1, now)).toEqual({ from: '2026-10-27', to: '2026-10-27' });
    expect(shiftRange({ from: '2026-10-27', to: '2026-10-27' }, -1, now)).toEqual({ from: '2026-10-26', to: '2026-10-26' });
  });

  it('groups, ticks and compares', () => {
    expect(defaultGroup(1)).toBe('hour');
    expect(defaultGroup(30)).toBe('day');
    expect(defaultGroup(120)).toBe('week');
    expect(defaultGroup(365)).toBe('month');
    expect(niceTicks(4600)).toEqual([0, 2000, 4000, 6000]);
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(compact(2500)).toBe('2.5K');
    expect(change(110, 100)).toEqual({ diff: 10, pct: 10 });
    expect(change(5, 0).pct).toBeNull();
  });

  it('writes the table as a spreadsheet', () => {
    const csv = toCsv([{ key: '2026-10-27', from: '2026-10-27', to: '2026-10-27', ...fig(100, 2) }], 'day');
    expect(csv.split('\n')[0]).toBe('Period,From,To,Sales,Refunds,Discounts,GST,Net sales,Orders,Average order,Items sold');
    expect(csv.split('\n')[1]).toMatch(/^"?Tue,? 27 Oct"?,2026-10-27,2026-10-27,100\.00,10\.00,5\.00,8\.00,82\.00,2,50\.00,4$/);
  });
});
