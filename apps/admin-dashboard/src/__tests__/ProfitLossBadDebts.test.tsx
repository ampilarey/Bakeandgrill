import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfitLossPage } from '../pages/ProfitLossPage';
import * as api from '../api';

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));

/*
 * GST audit, 2026-09-26: the breakdown adds up to net profit. The GST line
 * is net of the tax handed back in refunds, and written-off shop credit has
 * its own line.
 */
describe('ProfitLossPage breakdown', () => {
  const pnl = {
    from: '2026-09-01', to: '2026-09-24',
    revenue: { gross: 216, tax: 16, refunds: 54, refund_tax: 4, net: 150, orders: 2, wholesale: 0, wholesale_tax: 0, combined_net: 150 },
    cogs: 0, wholesale_cogs: 0, wholesale_waste_cost: 0,
    gross_profit: 150, gross_margin_pct: 100,
    expenses: { total: 0, by_category: [] },
    bad_debts: 25, waste_cost: 0, payment_processing_fees: 0,
    operating_profit: 125, net_profit_margin_pct: 83.33,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getProfitAndLoss').mockResolvedValue(pnl as never);
    vi.spyOn(api, 'getCashFlow').mockResolvedValue({ days: [], total_inflow: 0, total_outflow: 0, net_cash_flow: 0 } as never);
    vi.spyOn(api, 'getDailySummary').mockResolvedValue({ revenue: 0, orders: 0, avg_order: 0, net_profit: 0 } as never);
  });

  it('shows GST net of refunds and a bad debts line', async () => {
    render(<MemoryRouter><ProfitLossPage /></MemoryRouter>);

    const bad = (await screen.findByText('Bad debts written off')).parentElement as HTMLElement;
    expect(within(bad).getByText(/25\.00/)).toBeInTheDocument();
    const gst = screen.getByText('GST for MIRA').parentElement as HTMLElement;
    expect(within(gst).getByText(/12\.00/)).toBeInTheDocument();
  });
});
