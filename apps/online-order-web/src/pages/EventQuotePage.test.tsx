import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EventQuotePage } from './EventQuotePage';
import * as api from '../api/eventQuotes';

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../components/shell/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const liveQuote = {
  reference: 'EV-20260720-LIVE',
  status: 'awaiting_customer',
  contact_name: 'Aisha',
  event_date: '2026-08-10',
  fulfillment_method: 'pickup',
  fulfillment_time: '12:00',
  setup_time: '11:00',
  venue_name: 'Hall',
  headcount: 20,
  dietary_notes: 'No nuts',
  quote_version: 1,
  quote_expires_at: new Date(Date.now() + 86400000).toISOString(),
  quote_payment_laar: 50000,
  quote_is_deposit: true,
  subtotal_laar: 100000,
  tax_laar: 8000,
  total_laar: 108000,
  tax_inclusive: false,
  lines: [{ name: 'Tray', quantity: 2, unit_price: 500, notes: null, is_custom: false }],
};

describe('EventQuotePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders live quote with pay deposit label', async () => {
    vi.spyOn(api, 'fetchEventQuote').mockResolvedValue({ ok: true, quote: liveQuote });
    render(
      <MemoryRouter initialEntries={['/quote/tok']}>
        <Routes>
          <Route path="/quote/:token" element={<EventQuotePage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('quote-reference').textContent).toContain('EV-20260720-LIVE'));
    expect(screen.getByTestId('pay-now-label').textContent).toMatch(/deposit/i);
    expect(screen.getByTestId('approve-pay')).toBeTruthy();
    expect(screen.getByTestId('quote-dietary').textContent).toMatch(/No nuts/);
  });

  it('renders expired state', async () => {
    vi.spyOn(api, 'fetchEventQuote').mockResolvedValue({
      ok: false,
      status: 410,
      message: 'This quote has expired.',
      expired: true,
      reference: 'EV-OLD',
    });
    render(
      <MemoryRouter initialEntries={['/quote/tok']}>
        <Routes>
          <Route path="/quote/:token" element={<EventQuotePage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('quote-expired')).toBeTruthy());
    expect(screen.getByText(/Contact us to renew/i)).toBeTruthy();
  });

  it('renders paid/confirmed state', async () => {
    vi.spyOn(api, 'fetchEventQuote').mockResolvedValue({
      ok: true,
      quote: { ...liveQuote, status: 'confirmed' },
    });
    render(
      <MemoryRouter initialEntries={['/quote/tok']}>
        <Routes>
          <Route path="/quote/:token" element={<EventQuotePage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('quote-paid')).toBeTruthy());
    expect(screen.queryByTestId('approve-pay')).toBeNull();
  });
});
