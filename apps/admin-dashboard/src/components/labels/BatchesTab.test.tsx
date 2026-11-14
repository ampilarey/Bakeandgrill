/**
 * Owner, 2026-11-14: "add a page to view all". Batches lists every lot of stickers and every box label printed,
 * with the code its QR carries, and finds one by code, batch number, product or shop.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const fetchLabelPrints = vi.fn();
vi.mock('../../api', () => ({ fetchLabelPrints: (...a: unknown[]) => fetchLabelPrints(...a) }));

import { BatchesTab, batchState } from './BatchesTab';

const row = (id: number, extra = {}) => ({
  id, kind: 'sticker_en', layout: 'a4-custom', stock: '140 × 62 mm, 6 on A4', item: 'Frozen Momo', custom: true, delivery: null, copies: 6,
  mfg_date: '2026-11-14', exp_date: '2027-02-14', batch_code: 'B-1411', pack_qty: 8, details: null, printed_by: 'Owner', created_at: '2026-11-14T15:12:00Z',
  code: 'K7M2QX4P', batch_url: '/b/K7M2QX4P', reprint_of: null, reprintable: true, ...extra,
});
const show = () => render(
  <MemoryRouter initialEntries={['/labels/batches']}>
    <Routes>
      <Route path="/labels/batches" element={<BatchesTab />} />
      <Route path="/labels/stickers" element={<div data-testid="print-labels">{window.location.search}</div>} />
    </Routes>
  </MemoryRouter>,
);

describe('BatchesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchLabelPrints.mockResolvedValue({ data: [
      row(1),
      row(2, { kind: 'box_label', item: null, customer: 'NH Kuda Rah', box_lines: 2, delivery: 'DN-0042', mfg_date: null, exp_date: null, batch_code: null, code: 'BX9TR3WN', batch_url: '/b/BX9TR3WN', reprintable: false }),
      row(3, { item: 'Garlic Sauce', batch_code: null, code: null, batch_url: null, reprintable: false, exp_date: '2020-01-01' }),
    ], current_page: 1, last_page: 1, total: 3 });
  });

  it('lists stickers and box labels with their code, batch number and dates', async () => {
    show();
    const momo = await screen.findByTestId('batch-1');
    expect(momo).toHaveTextContent('Frozen Momo');
    expect(momo).toHaveTextContent('6 stickers · 140 × 62 mm, 6 on A4');
    expect(momo).toHaveTextContent('Batch B-1411');
    expect(screen.getByTestId('batch-code-1')).toHaveAttribute('href', '/b/K7M2QX4P');
    const box = screen.getByTestId('batch-2');
    expect(box).toHaveTextContent('NH Kuda Rah');
    expect(box).toHaveTextContent('Box label · 2 items · delivery DN-0042');
    expect(screen.getByTestId('batch-code-2')).toHaveAttribute('href', '/b/BX9TR3WN');
    // An old print with no code says so, and one past its date is marked.
    expect(screen.getByTestId('batch-3')).toHaveTextContent('No batch number');
    expect(screen.getByTestId('batch-3')).toHaveTextContent('Past its date');
    expect(screen.getByTestId('batches-count')).toHaveTextContent('3 batches');
  });

  it('finds a batch by what is typed, and shows box labels alone', async () => {
    show();
    await screen.findByTestId('batch-1');
    fireEvent.change(screen.getByTestId('batches-search'), { target: { value: 'B-1411' } });
    await waitFor(() => expect(fetchLabelPrints).toHaveBeenLastCalledWith({ page: 1, group: undefined, q: 'B-1411' }), { timeout: 2000 });
    fireEvent.click(screen.getByRole('button', { name: 'Box labels' }));
    await waitFor(() => expect(fetchLabelPrints).toHaveBeenLastCalledWith({ page: 1, group: 'boxes', q: 'B-1411' }), { timeout: 2000 });
  });

  it('Print again opens the full form on that very print', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Print the sticker of K7M2QX4P again' }));
    expect(await screen.findByTestId('print-labels')).toBeInTheDocument();
  });

  it('says how a batch stands against today', () => {
    expect(batchState('2026-11-13', '2026-11-14')).toEqual({ word: 'Past its date', tone: 'danger' });
    expect(batchState('2026-11-14', '2026-11-14')).toEqual({ word: 'Use today', tone: 'warning' });
    expect(batchState('2026-11-15', '2026-11-14')).toEqual({ word: '1 day left', tone: 'warning' });
    expect(batchState('2026-12-14', '2026-11-14')).toEqual({ word: '30 days left', tone: 'success' });
    expect(batchState(null)).toBeNull();
  });
});
