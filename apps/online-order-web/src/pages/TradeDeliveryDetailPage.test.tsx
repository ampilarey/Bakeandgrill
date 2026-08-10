import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TradeDeliveryDetailPage } from './TradeDeliveryDetailPage';
import * as tradeApi from '../api/trade';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    authReady: true,
    customerName: 'Shop',
    setAuth: vi.fn(),
    clearAuth: vi.fn(),
  }),
}));

vi.mock('../api/trade');

const delivery = {
  id: 9,
  delivery_number: 'TD-1',
  date: '2026-08-01',
  status: 'Delivered',
  sales_reported: false,
  can_report_sales: true,
  reported_at: null,
  summary: '1 item, 10 units',
  lines: [
    {
      id: 1,
      item_name: 'Momo set',
      qty_delivered: 10,
      unit_price_mvr: 50,
      reported_sold_qty: null,
    },
  ],
};

describe('TradeDeliveryDetailPage report form', () => {
  beforeEach(() => {
    vi.mocked(tradeApi.fetchTradeDelivery).mockReset();
    vi.mocked(tradeApi.reportTradeSales).mockReset();
  });

  it('shows plain sold-qty prompts and submits report', async () => {
    vi.mocked(tradeApi.fetchTradeDelivery).mockResolvedValue({ delivery });
    vi.mocked(tradeApi.reportTradeSales).mockResolvedValue({
      delivery: {
        ...delivery,
        sales_reported: true,
        reported_at: '2026-08-02T10:00:00Z',
        lines: [{ ...delivery.lines[0], reported_sold_qty: 6 }],
      },
      message: 'Thanks — we have your sales numbers.',
    });

    render(
      <MemoryRouter initialEntries={['/account/deliveries/9']}>
        <Routes>
          <Route path="/account/deliveries/:id" element={<TradeDeliveryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Momo set — 10 delivered — how many did you sell/i)).toBeInTheDocument();
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /submit sales/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm & submit/i }));

    await waitFor(() => expect(tradeApi.reportTradeSales).toHaveBeenCalled());
    const args = vi.mocked(tradeApi.reportTradeSales).mock.calls[0];
    expect(args[0]).toBe(9);
    expect(args[1].lines).toEqual([{ line_id: 1, sold_qty: 6 }]);
    expect(await screen.findByText(/thanks — we have your sales numbers/i)).toBeInTheDocument();
  });
});
