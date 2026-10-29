import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentChecksView } from '../../api';

/*
 * Owner, 2026-10-28: a QR customer types the bill amount themselves and the
 * cashier keys the card machine by hand; the cashier cannot see MPOS, so each
 * payment is ticked here against MPOS or the card slip.
 */
const api = vi.hoisted(() => ({
  fetchPaymentChecks: vi.fn(), markPaymentCheck: vi.fn(), undoPaymentCheck: vi.fn(),
  markPaymentChecksMatched: vi.fn(), setPaymentCheckStart: vi.fn(),
}));
vi.mock('../../api', () => api);

import { PaymentChecksTab, diffWords } from './PaymentChecksTab';

const view = (over: Partial<PaymentChecksView> = {}): PaymentChecksView => ({
  range: { from: '2026-10-27', to: '2026-10-28', start_date: '2026-10-28' },
  summary: {
    unchecked: { count: 2, laar: 19500 }, matched: { count: 1, laar: 1000 }, different: { count: 0, laar: 0, diff_laar: 0 },
    qr: { count: 2, laar: 16500, unchecked: 1 }, card: { count: 1, laar: 4000, unchecked: 1 },
    transfer: { count: 1, laar: 6000, unchecked: 0 },
  },
  payments: [
    { id: 1, at: '2026-10-28T09:41:00+05:00', method: 'qr', amount_laar: 15500, reference: null, order: { id: 67, order_number: 'BG-0067', type: 'takeaway' }, cashier: 'Ariya', station: 'POS 1', check: null },
    { id: 2, at: '2026-10-28T09:50:00+05:00', method: 'card', amount_laar: 4000, reference: null, order: { id: 68, order_number: 'BG-0068', type: 'dine_in' }, cashier: 'Ariya', station: 'POS 1', check: null },
  ],
  meta: { page: 1, last_page: 1, total: 2, per_page: 50 },
  choices: { staff: [{ id: 9, name: 'Ariya' }], stations: [{ id: 3, name: 'POS 1' }] },
  ...over,
});

const renderTab = () => render(<MemoryRouter><PaymentChecksTab from="2026-10-27" to="2026-10-28" onError={vi.fn()} /></MemoryRouter>);

describe('PaymentChecksTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchPaymentChecks.mockResolvedValue(view());
    api.markPaymentCheck.mockResolvedValue({ payment: { id: 1, check: null } });
    api.markPaymentChecksMatched.mockResolvedValue({ marked: 2 });
  });

  it('lists the payments not checked with their order, and ticks one as matching', async () => {
    renderTab();
    const card = await screen.findByTestId('payment-check-1', {}, { timeout: 5000 });
    expect(api.fetchPaymentChecks).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-10-27', to: '2026-10-28', state: 'unchecked', method: '' }));
    expect(card).toHaveTextContent(/MVR\s155\.00/);
    expect(within(card).getByRole('link', { name: '#BG-0067' })).toHaveAttribute('href', '/orders?order=67');
    fireEvent.click(screen.getByTestId('payment-check-match-1'));
    await waitFor(() => expect(api.markPaymentCheck).toHaveBeenCalledWith(1, { result: 'matched' }));
    expect(api.fetchPaymentChecks).toHaveBeenCalledTimes(2);
  });

  it('records a different amount with what MPOS showed and says how much less', async () => {
    renderTab();
    fireEvent.click(await screen.findByTestId('payment-check-different-1', {}, { timeout: 5000 }));
    fireEvent.change(screen.getByTestId('payment-check-seen'), { target: { value: '150' } });
    expect(screen.getByTestId('payment-check-diff')).toHaveTextContent(/Paid MVR\s5\.00 less than the bill/);
    fireEvent.change(screen.getByPlaceholderText('Last digits of the transfer'), { target: { value: '4471' } });
    fireEvent.click(screen.getByTestId('payment-check-save'));
    await waitFor(() => expect(api.markPaymentCheck).toHaveBeenCalledWith(1, { result: 'different', seen: 150, reference: '4471', note: undefined }));
  });

  it('refuses the same amount as different', async () => {
    renderTab();
    fireEvent.click(await screen.findByTestId('payment-check-different-2', {}, { timeout: 5000 }));
    fireEvent.change(screen.getByTestId('payment-check-seen'), { target: { value: '40' } });
    fireEvent.click(screen.getByTestId('payment-check-save'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Use Matches instead');
    expect(api.markPaymentCheck).not.toHaveBeenCalled();
  });

  it('marks every picked payment as matching at once', async () => {
    renderTab();
    await screen.findByTestId('payment-check-1', {}, { timeout: 5000 });
    fireEvent.click(screen.getByLabelText(/Pick all 2 shown/));
    fireEvent.click(screen.getByTestId('payment-checks-bulk'));
    await waitFor(() => expect(api.markPaymentChecksMatched).toHaveBeenCalledWith([1, 2]));
  });

  it('filters by state, method, cashier, station and amount', async () => {
    renderTab();
    await screen.findByTestId('payment-check-1', {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole('tab', { name: /^Different/ }));
    await waitFor(() => expect(api.fetchPaymentChecks).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'different' })));
    fireEvent.click(screen.getByRole('tab', { name: 'QR' }));
    await waitFor(() => expect(api.fetchPaymentChecks).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'qr' })));
    fireEvent.change(screen.getByLabelText('Cashier'), { target: { value: '9' } });
    await waitFor(() => expect(api.fetchPaymentChecks).toHaveBeenLastCalledWith(expect.objectContaining({ user_id: 9 })));
    fireEvent.change(screen.getByLabelText('Station'), { target: { value: '3' } });
    await waitFor(() => expect(api.fetchPaymentChecks).toHaveBeenLastCalledWith(expect.objectContaining({ device_id: 3 })));
    fireEvent.change(screen.getByLabelText('Amount from (MVR)'), { target: { value: '100' } });
    await waitFor(() => expect(api.fetchPaymentChecks).toHaveBeenLastCalledWith(expect.objectContaining({ min: '100' })), { timeout: 2000 });
  });

  it('shows a checked payment with who checked it and Undo', async () => {
    api.fetchPaymentChecks.mockResolvedValue(view({ payments: [
      { ...view().payments[1], check: { status: 'different', seen_laar: 400, diff_laar: -3600, reference: null, note: 'Keyed 4', by: 'Owner', at: '2026-10-28T10:00:00+05:00' } },
    ] }));
    api.undoPaymentCheck.mockResolvedValue({ payment: { id: 2, check: null } });
    renderTab();
    const card = await screen.findByTestId('payment-check-2', {}, { timeout: 5000 });
    expect(card).toHaveTextContent(/Paid MVR\s36\.00 less/);
    expect(card).toHaveTextContent('Owner');
    fireEvent.click(within(card).getByRole('button', { name: /Undo/ }));
    await waitFor(() => expect(api.undoPaymentCheck).toHaveBeenCalledWith(2));
  });

  it('shows a transfer the bank statement matched, with no Undo but a way to the Transfers tab', async () => {
    api.fetchPaymentChecks.mockResolvedValue(view({ payments: [
      { id: 3, at: '2026-10-28T11:00:00+05:00', method: 'transfer', amount_laar: 6000, reference: null, order: { id: 70, order_number: 'BG-0070', type: 'takeaway' }, cashier: 'Ariya', station: 'POS 1',
        check: { status: 'matched', seen_laar: 6000, diff_laar: 0, reference: 'FT123', note: null, by: 'Bank statement', at: '2026-10-28T00:00:00+05:00', source: 'statement' } },
    ] }));
    renderTab();
    const card = await screen.findByTestId('payment-check-3', {}, { timeout: 5000 });
    expect(card).toHaveTextContent('Transfer');
    expect(card).toHaveTextContent('Bank statement');
    expect(within(card).queryByRole('button', { name: /Undo/ })).toBeNull();
    expect(within(card).getByRole('link', { name: 'On the Transfers tab' })).toHaveAttribute('href', '/finance/settlements?view=transfers');
    fireEvent.click(screen.getByRole('tab', { name: 'Transfer' }));
    await waitFor(() => expect(api.fetchPaymentChecks).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'transfer' })));
  });

  it('asks for the bank app amount on a transfer', async () => {
    api.fetchPaymentChecks.mockResolvedValue(view({ payments: [{ ...view().payments[0], id: 4, method: 'transfer' }] }));
    renderTab();
    fireEvent.click(await screen.findByTestId('payment-check-different-4', {}, { timeout: 5000 }));
    expect(screen.getByText(/Amount the bank app shows/)).toBeInTheDocument();
  });

  it('words a difference', () => {
    expect(diffWords(-500)).toBe('Paid MVR 5.00 less');
    expect(diffWords(250)).toBe('Paid MVR 2.50 more');
  });
});
