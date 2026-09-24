import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TradeStatementPage } from './TradeStatementPage';

/* Wholesale audit, 2026-09-26: a shop in credit sees it; a closed account still sees and pays its invoices. */

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, authReady: true, customerName: 'Shop', setAuth: vi.fn(), clearAuth: vi.fn() }),
}));

vi.mock('../components/shell/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock('../api/trade', () => ({
  fetchTradeStatement: vi.fn().mockResolvedValue({
    statement: {
      balance_owed_mvr: 250,
      credit_in_hand_mvr: 0,
      overdue_mvr: 0,
      account_active: false,
      invoices: [
        { id: 4, invoice_number: 'TI-0004', issue_date: '2026-09-01', due_date: '2026-09-15', total_mvr: 250, amount_paid_mvr: 0, outstanding_mvr: 250, status: 'Unpaid', is_overdue: false, can_pay: true },
      ],
      payments: [],
      entries: [],
    },
  }),
  openTradeInvoicePdf: vi.fn(),
  payTradeInvoice: vi.fn(),
}));

describe('TradeStatementPage', () => {
  it('tells a closed shop it can still see and pay its invoices', async () => {
    render(<MemoryRouter><TradeStatementPage /></MemoryRouter>);
    expect(await screen.findByTestId('statement-inactive')).toHaveTextContent('This trade account is closed. You can still see your invoices here and pay what is left.');
    expect(screen.getByTestId('pay-invoice-4')).toBeInTheDocument();
    expect(screen.queryByTestId('statement-credit')).toBeNull();
  });
});
