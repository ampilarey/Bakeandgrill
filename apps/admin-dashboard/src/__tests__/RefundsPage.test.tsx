import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import RefundsPage from '../pages/RefundsPage';
import { renderWithRouter } from './testUtils';
import * as api from '../api';

/*
 * Refund audit, 2026-09-25: the approver sees where the money comes from,
 * refunds owed by card / bank are listed and can be marked paid out, and
 * the list filters by date and search.
 */

vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({
    can: () => true,
    user: { id: 1, name: 'Owner', role: 'owner', permissions: [] },
    loading: false,
  }),
}));

vi.mock('../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../components/ui')>('../components/ui');
  return { ...actual, useToast: () => ({ success: vi.fn(), error: vi.fn() }) };
});

const refund = (over: Partial<api.AdminRefund>): api.AdminRefund => ({
  id: 1, order_id: 10, order: { id: 10, order_number: 'BG-1001' }, amount: 50, reason: 'Cold chips', reason_category: 'wrong_item',
  status: 'approved', refund_phone: '+9607778888', created_at: '2026-09-25T09:00:00+05:00', user: { id: 2, name: 'Cashier' },
  approver: { id: 1, name: 'Owner' }, phone_flags: { refund_phone: '+9607778888', has_prior_order_history: true, refunds_last_90_days: 0 },
  tender_breakdown: { credit_reversed_laar: 0, gift_reversed_laar: 0, wallet_reversed_laar: 0, external_tender_laar: 3000, drawer_cash_out_laar: 2000 },
  external_tender_laar: 3000, drawer_cash_out_laar: 2000, owed_externally: true, ...over,
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'fetchAdminRefunds').mockResolvedValue({
    refunds: {
      data: [
        refund({ id: 1 }),
        refund({ id: 2, status: 'pending', owed_externally: false, approver: null, tender_breakdown: { credit_reversed_laar: 0, gift_reversed_laar: 0, wallet_reversed_laar: 0, external_tender_laar: 5000, drawer_cash_out_laar: 0 }, external_tender_laar: 5000, drawer_cash_out_laar: 0 }),
        refund({ id: 3, owed_externally: false, paid_out_at: '2026-09-25T10:00:00+05:00', paid_out_method: 'bank_transfer', paid_out_reference: 'BML-7781', paid_out_by: { id: 1, name: 'Owner' } }),
      ],
      current_page: 1, last_page: 1, total: 3,
    },
    meta: { approved_amount_total: 150, pending_count: 1, phone_added_pending: 0, external_owed_count: 1, external_owed_total: 30 },
  });
  vi.spyOn(api, 'markRefundPaidOut').mockResolvedValue({ refund: refund({ id: 1, owed_externally: false, paid_out_at: '2026-09-25T11:00:00+05:00' }), message: 'Marked paid out.' });
});

describe('RefundsPage — owed refunds and breakdown', () => {
  it('shows the breakdown, what is owed, what was paid out, and the owed stat', async () => {
    renderWithRouter(<RefundsPage />);
    const amount = await screen.findByTestId('refund-amount-1');
    expect(amount).toHaveTextContent('Drawer MVR 20.00 · Card/online MVR 30.00');
    expect(amount).toHaveTextContent('OWED: MVR 30.00 not yet sent back');
    expect(screen.getByTestId('refund-amount-3')).toHaveTextContent(/Paid out .+ via bank transfer \(BML-7781\) by Owner/);
    expect(screen.getByText('Owed by card / bank')).toBeInTheDocument();
    expect(screen.getByText('1 refund not yet sent back')).toBeInTheDocument();
    expect(screen.queryByText('Processed')).toBeNull();
  });

  it('marks a refund paid out with a method and reference', async () => {
    renderWithRouter(<RefundsPage />);
    fireEvent.click(await screen.findByLabelText('Mark refund 1 paid out'));
    fireEvent.change(screen.getByLabelText('Payout method'), { target: { value: 'card_terminal' } });
    fireEvent.change(screen.getByLabelText('Payout reference'), { target: { value: 'RV-22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark paid out' }));
    await waitFor(() => expect(api.markRefundPaidOut).toHaveBeenCalledWith(1, { method: 'card_terminal', reference: 'RV-22' }));
    await waitFor(() => expect(api.fetchAdminRefunds).toHaveBeenCalledTimes(2));
  });

  it('warns the approver when part of the refund must be sent back by hand', async () => {
    renderWithRouter(<RefundsPage />);
    const row = (await screen.findByTestId('refund-amount-2')).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByText('Approve'));
    const box = await screen.findByTestId('approve-breakdown');
    expect(box).toHaveTextContent('Card/online MVR 50.00');
    expect(box).toHaveTextContent('The card / online part is not returned by approving.');
  });

  it('sends the owed view, dates and search to the API', async () => {
    renderWithRouter(<RefundsPage />);
    await screen.findByTestId('refund-amount-1');
    fireEvent.change(screen.getByLabelText('Refund status'), { target: { value: 'owed' } });
    await waitFor(() => expect(api.fetchAdminRefunds).toHaveBeenLastCalledWith(expect.objectContaining({ owed: true, status: undefined })));
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Search refunds'), { target: { value: 'BG-1001' } });
    fireEvent.click(screen.getByText('Search'));
    await waitFor(() => expect(api.fetchAdminRefunds).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-09-01', q: 'BG-1001', page: 1 })));
  });
});
