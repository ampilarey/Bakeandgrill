import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import WholesaleStatementPage from '../pages/WholesaleStatementPage';
import { renderWithRouter } from './testUtils';

/* Wholesale audit, 2026-09-26: credit notes from the statement; credit in hand shown. */

const mockCan = vi.hoisted(() => vi.fn((slug: string) => ['customers.credit.repay', 'trade.invoice'].includes(slug)));

vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({ can: mockCan, user: null, loading: false }),
}));

const statement = vi.hoisted(() => ({
  exposure: {
    balance_owed_laar: 40000, credit_in_hand_laar: 0, holding_unbilled_laar: 0, exposure_laar: 40000,
    credit_limit_laar: 500000, available_laar: 460000, credit_enabled: true,
    balance_owed_mvr: '400.00', holding_unbilled_mvr: '0.00', exposure_mvr: '400.00', credit_limit_mvr: '5000.00',
  },
  balance_owed_laar: 40000,
  credit_in_hand_laar: 12550,
  holding_unbilled_laar: 0,
  overdue_laar: 0,
  account_active: true,
  invoices: [
    { id: 7, invoice_number: 'TI-0007', issue_date: '2026-09-01', due_date: '2026-09-15', total_laar: 40000, amount_paid_laar: 15000, credited_laar: 0, balance_laar: 25000, status: 'sent', is_overdue: false, can_credit: true },
    { id: 8, invoice_number: 'TI-0008', issue_date: '2026-08-01', due_date: '2026-08-15', total_laar: 10000, amount_paid_laar: 10000, credited_laar: 0, balance_laar: 0, status: 'void', is_overdue: false, can_credit: false },
  ],
  payments: [
    { id: 3, amount_laar: 15000, method: 'cash', processed_at: '2026-09-05T10:00:00Z', reference_number: null, invoice_ids: [7], applied: [{ invoice_id: 7, amount_laar: 15000 }] },
  ],
  entries: [],
}));

vi.mock('../api', () => ({
  fetchTradeAccount: vi.fn().mockResolvedValue({ trade_account: { id: 1, shop_name: 'Island Mart', is_active: true, customer: { id: 9, name: 'Island Mart', phone: '7722001' } } }),
  fetchTradeStatement: vi.fn().mockResolvedValue({ statement }),
  recordTradePayment: vi.fn(),
  createTradeCreditNote: vi.fn().mockResolvedValue({ credit_note: { id: 20, invoice_number: 'CN-0001', total_laar: 25000 }, invoice: { id: 7, status: 'void' } }),
  generateInvoicePdf: vi.fn(),
}));

import * as api from '../api';

function renderPage() {
  return renderWithRouter(
    <Routes><Route path="/wholesale/:id/statement" element={<WholesaleStatementPage />} /></Routes>,
    { route: '/wholesale/1/statement' },
  );
}

describe('WholesaleStatementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows credit in hand, the credit-noted invoice and what each payment covered', async () => {
    renderPage();
    expect(await screen.findByText('In credit (comes off next invoice)')).toBeInTheDocument();
    expect(screen.getByText('MVR 125.50')).toBeInTheDocument();
    expect(screen.getByText('Credit-noted')).toBeInTheDocument();
    expect(screen.getByText('TI-0007 MVR 150.00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Credit note TI-0008' })).toBeNull();
  });

  it('raises a full credit note and explains that the paid part stays as credit', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Credit note TI-0007' }));
    expect(screen.getByText(/The shop has paid/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Credit note reason'), { target: { value: 'Billed the wrong shop.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Raise credit note' }));
    await waitFor(() => expect(api.createTradeCreditNote).toHaveBeenCalledWith(7, { credit_note_reason: 'Billed the wrong shop.', amount_laar: undefined }));
    expect(await screen.findByTestId('credit-note-notice')).toHaveTextContent('The shop had paid MVR 150.00; that stays on their account as credit');
  });

  it('sends a partial amount in laari and refuses one that is not below what is left', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Credit note TI-0007' }));
    fireEvent.click(screen.getByLabelText('Credit part of it'));
    fireEvent.change(screen.getByLabelText('Credit note reason'), { target: { value: 'Two stale boxes.' } });
    fireEvent.change(screen.getByLabelText('Credit amount MVR'), { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Raise credit note' }));
    expect(await screen.findByText(/below MVR 400.00/)).toBeInTheDocument();
    expect(api.createTradeCreditNote).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Credit amount MVR'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Raise credit note' }));
    await waitFor(() => expect(api.createTradeCreditNote).toHaveBeenCalledWith(7, { credit_note_reason: 'Two stale boxes.', amount_laar: 10000 }));
  });
});
