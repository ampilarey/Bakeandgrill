import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

const fetchExpiringLabels = vi.fn();

vi.mock('../../api', () => ({
  fetchExpiringLabels: (...a: unknown[]) => fetchExpiringLabels(...a),
}));

import { ExpiringStock, expiryWords } from './ExpiringStock';

const Where = () => <output data-testid="where">{useLocation().pathname + useLocation().search}</output>;

const group = (extra: Record<string, unknown>) => ({
  key: 'k', kind: 'item', id: 1, name: 'Bajiya', copies: 36, prints: 2, batch_code: '261010', mfg_date: '2026-10-10', exp_date: '2026-10-13',
  days_left: 1, codes: ['BAJ22222', 'BAJ11111'], last_printed_at: '2026-10-10T08:00:00Z', alerted: false, ...extra,
});

/*
 * Expiring printed stock (2026-10-12): the card over Pack stickers, from the
 * print log, with Reprint that opens the form on that product.
 */
describe('ExpiringStock', () => {
  beforeEach(() => fetchExpiringLabels.mockReset());

  it('says when each batch expires and opens the form on the product to reprint', async () => {
    fetchExpiringLabels.mockResolvedValue({ data: [
      group({ key: 'g', name: 'Gulha', id: 2, copies: 30, batch_code: null, exp_date: '2026-10-11', days_left: -1, codes: ['GUL11111'] }),
      group({}),
      group({ key: 'c', kind: 'custom', id: 7, name: 'Gift box', copies: 4, exp_date: '2026-10-17', days_left: 5, codes: [] }),
      group({ key: 'x', kind: 'gone', id: null, name: 'Removed product', copies: 2, days_left: 0, codes: [] }),
    ], days: 7, expired_kept_days: 2 });
    render(<MemoryRouter initialEntries={['/labels/stickers']}><ExpiringStock /><Where /></MemoryRouter>);

    expect(await screen.findByText('Expiring printed stock (4)')).toBeInTheDocument();
    const chips = screen.getAllByTestId('expiry-chip').map((c) => c.textContent);
    expect(chips[0]).toBe('Expires expired yesterday');
    expect(chips[1]).toBe('Expires tomorrow');
    expect(chips[2]).toMatch(/^Expires in 5 days \(/);
    expect(chips[3]).toBe('Expires today');
    expect(screen.getAllByText(/Batch 261010/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Open the pack page of Bajiya' })).toHaveAttribute('href', '/b/BAJ22222');
    // A removed product cannot be reprinted; the others open the form on themselves.
    expect(screen.queryByRole('button', { name: 'Reprint Removed product' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reprint Gift box' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/labels/stickers?custom=7'));
    fireEvent.click(screen.getByRole('button', { name: 'Reprint Bajiya' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/labels/stickers?item=1'));
    expect(fetchExpiringLabels).toHaveBeenCalledWith(7);
  });

  it('shows nothing when nothing is near its date', async () => {
    fetchExpiringLabels.mockResolvedValue({ data: [], days: 7, expired_kept_days: 2 });
    const { container } = render(<MemoryRouter><ExpiringStock /></MemoryRouter>);
    await waitFor(() => expect(fetchExpiringLabels).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="expiring-stock"]')).toBeNull();
  });

  it('words the days left', () => {
    expect(expiryWords({ days_left: 2, exp_date: '2026-10-14' })).toMatch(/^in 2 days \(/);
    expect(expiryWords({ days_left: 1, exp_date: '2026-10-13' })).toBe('tomorrow');
    expect(expiryWords({ days_left: 0, exp_date: '2026-10-12' })).toBe('today');
    expect(expiryWords({ days_left: -1, exp_date: '2026-10-11' })).toBe('expired yesterday');
    expect(expiryWords({ days_left: -3, exp_date: '2026-10-09' })).toBe('expired 3 days ago');
  });
});
