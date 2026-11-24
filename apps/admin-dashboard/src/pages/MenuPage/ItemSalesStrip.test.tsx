import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemSalesStrip, agoWords, trendOf } from './ItemSalesStrip';
import type { ItemBrief } from '../../api';

const fetchItemBrief = vi.fn();
vi.mock('../../api', () => ({ fetchItemBrief: (id: number) => fetchItemBrief(id) }));

const brief = (over: Partial<ItemBrief> = {}): ItemBrief => ({
  item_id: 7, days: 30, from: '2026-10-26', to: '2026-11-24', today: '2026-11-24',
  recent: { qty: 140, sales: 2100, orders: 96 },
  before: { qty: 100, sales: 1500, orders: 70 },
  all_time: { qty: 1820.5, sales: 27300, orders: 1200 },
  first_sold: '2026-01-04', last_sold: '2026-11-23',
  sizes: [{ key: '3', label: 'Small', qty: 90, all_qty: 1200 }, { key: '4', label: 'Large', qty: 50, all_qty: 620.5 }],
  reviews: { count: 12, rating: 4.6 }, questions_waiting: 2, alerts_waiting: 3,
  ...over,
});

const show = () => render(<MemoryRouter><ItemSalesStrip itemId={7} /></MemoryRouter>);

describe('ItemSalesStrip', () => {
  // Braces: a hook that returns a function has it run as the test's clean-up.
  beforeEach(() => { fetchItemBrief.mockReset(); });

  it('shows what sold lately and in all, each size apart, with the way to the full report', async () => {
    fetchItemBrief.mockResolvedValue(brief());
    show();
    await waitFor(() => expect(screen.getByTestId('item-sales-recent')).toBeInTheDocument());
    expect(fetchItemBrief).toHaveBeenCalledWith(7);
    expect(screen.getByTestId('item-sales-recent')).toHaveTextContent('140');
    expect(screen.getByTestId('item-sales-recent')).toHaveTextContent('MVR 2,100.00');
    expect(screen.getByTestId('item-sales-all')).toHaveTextContent('1,820.5');
    expect(screen.getByTestId('item-sales-last')).toHaveTextContent('yesterday');
    expect(screen.getByTestId('item-sales-trend')).toHaveTextContent('up 40% on the 30 days before');
    expect(screen.getByTestId('item-sales-sizes')).toHaveTextContent('Small 90 (1,200 all time)');
    expect(screen.getByTestId('item-sales-extras')).toHaveTextContent('4.6 from 12 reviews');
    expect(screen.getByTestId('item-sales-extras')).toHaveTextContent('2 questions to answer');
    expect(screen.getByTestId('item-sales-extras')).toHaveTextContent('3 waiting to hear it is back');
    const more = screen.getByTestId('item-sales-more').getAttribute('href') ?? '';
    expect(more).toContain('tab=Items+Sold');
    expect(more).toContain('item=7');
    expect(more).toContain('from=2026-10-26');
  });

  it('says so for a dish never sold', async () => {
    fetchItemBrief.mockResolvedValue(brief({ recent: { qty: 0, sales: 0, orders: 0 }, before: { qty: 0, sales: 0, orders: 0 }, all_time: { qty: 0, sales: 0, orders: 0 }, last_sold: null, first_sold: null, sizes: [], reviews: { count: 0, rating: null }, questions_waiting: 0, alerts_waiting: 0 }));
    const first = show();
    await waitFor(() => expect(screen.getByTestId('item-sales-never')).toHaveTextContent('Not sold yet.'));
    expect(screen.queryByTestId('item-sales-more')).toBeNull();
    first.unmount();
  });

  it('stays out of the way when the figures do not load', async () => {
    fetchItemBrief.mockRejectedValue(new Error('no'));
    show();
    await waitFor(() => expect(screen.queryByTestId('item-sales-strip')).toBeNull());
  });

  it('words the last sale and the trend', () => {
    expect(agoWords('2026-11-24', '2026-11-24')).toBe('today');
    expect(agoWords('2026-11-12', '2026-11-24')).toBe('12 days ago');
    expect(agoWords('2026-06-01', '2026-11-24')).toBe('1 Jun 2026');
    expect(trendOf(50, 100)).toEqual({ up: false, words: 'down 50% on the 30 days before' });
    expect(trendOf(5, 0)).toEqual({ up: true, words: 'none in the 30 days before' });
    expect(trendOf(0, 0)).toBeNull();
    expect(trendOf(10, 10)).toBeNull();
  });
});
