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

import { PaymentChecksTab, diffWords, emptyWords } from './PaymentChecksTab';

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

const onRange = vi.fn();
const renderTab = () => render(<MemoryRouter><PaymentChecksTab from="2026-10-27" to="2026-10-28" onRange={onRange} onError={vi.fn()} /></MemoryRouter>);

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
    fireEvent.click(screen.getByTestId('payment-checks-filters'));
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

  it('says when the start date hides earlier days, and moves it back in one tap', async () => {
    api.fetchPaymentChecks.mockResolvedValue(view({ payments: [], range: { from: '2026-10-27', to: '2026-10-28', start_date: '2026-10-29' } }));
    api.setPaymentCheckStart.mockResolvedValue({ start_date: '2026-10-27' });
    renderTab();
    expect(await screen.findByTestId('payment-checks-start-note', {}, { timeout: 5000 })).toHaveTextContent(/before that day are not listed/);
    fireEvent.click(screen.getByTestId('payment-checks-start-from'));
    await waitFor(() => expect(api.setPaymentCheckStart).toHaveBeenCalledWith('2026-10-27'));
  });

  it('says nothing about the start date when it is inside the range', async () => {
    api.fetchPaymentChecks.mockResolvedValue(view({ range: { from: '2026-10-27', to: '2026-10-28', start_date: '2026-10-01' } }));
    renderTab();
    await screen.findByTestId('payment-check-1', {}, { timeout: 5000 });
    expect(screen.queryByTestId('payment-checks-start-note')).toBeNull();
  });

  it('picks dates by preset, and shows two date boxes only for Pick dates', async () => {
    renderTab();
    await screen.findByTestId('payment-check-1', {}, { timeout: 5000 });
    expect(screen.queryByLabelText('From')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Yesterday' }));
    expect(onRange).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    fireEvent.click(screen.getByTestId('payment-checks-custom'));
    expect(screen.getByText('From')).toBeInTheDocument();
  });

  it('lists the payments day by day with each day\'s total, one column', async () => {
    renderTab();
    const day = await screen.findByTestId('payment-checks-day-2026-10-28', {}, { timeout: 5000 });
    expect(day).toHaveTextContent(/2 · MVR\s195\.00/);
    fireEvent.click(within(day).getByLabelText(/^Pick (Mon|Tue|Wed|Thu|Fri|Sat|Sun)/));
    expect(screen.getByTestId('payment-checks-bulk')).toHaveTextContent('Mark 2 as matching');
  });

  it('shows the cashier and amount filters as chips that clear with a tap', async () => {
    renderTab();
    await screen.findByTestId('payment-check-1', {}, { timeout: 5000 });
    fireEvent.click(screen.getByTestId('payment-checks-filters'));
    fireEvent.change(screen.getByLabelText('Cashier'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('payment-checks-filters')).toHaveTextContent('Filters · 1');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ariya' }));
    await waitFor(() => expect(api.fetchPaymentChecks).toHaveBeenLastCalledWith(expect.objectContaining({ user_id: null })));
  });

  it('with QR picked and no QR payments, keeps the other boxes counted and names what is hidden', async () => {
    // Owner, 2026-10-29: "when i select today its not showing". QR was picked; today's payments were cards.
    const empty = view({ payments: [], summary: { ...view().summary, unchecked: { count: 0, laar: 0 } } });
    api.fetchPaymentChecks.mockImplementation(async (f: { method?: string }) => (f.method === 'qr'
      ? { ...empty, methods: { qr: { count: 0, laar: 0, unchecked: 0 }, card: { count: 2, laar: 4000, unchecked: 2 }, transfer: { count: 0, laar: 0, unchecked: 0 } } }
      : view()));
    renderTab();
    await screen.findByTestId('payment-check-1', {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole('tab', { name: 'QR' }));
    expect(await screen.findByText(/No QR payments to check in these days\. 2 card still to check\./)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Card' })).toHaveTextContent('40.00');
    expect(screen.getByTestId('payment-checks-method-note')).toHaveTextContent('Showing QR only.');
    fireEvent.click(screen.getByTestId('payment-checks-show-all'));
    await waitFor(() => expect(api.fetchPaymentChecks).toHaveBeenLastCalledWith(expect.objectContaining({ method: '' })));
    expect(await screen.findByTestId('payment-check-1')).toBeInTheDocument();
  });

  it('keeps the other picks when one payment is ticked', async () => {
    renderTab();
    await screen.findByTestId('payment-check-1', {}, { timeout: 5000 });
    fireEvent.click(screen.getByLabelText('Pick payment 2'));
    api.fetchPaymentChecks.mockResolvedValueOnce(view({ payments: [{ ...view().payments[0], check: { status: 'matched', seen_laar: 15500, diff_laar: 0, reference: null, note: null, by: 'Owner', at: null, source: 'hand' } }, view().payments[1]] }));
    fireEvent.click(screen.getByTestId('payment-check-match-1'));
    await waitFor(() => expect(api.markPaymentCheck).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('payment-checks-bulk')).toHaveTextContent('Mark 1 as matching'));
  });

  it('draws only the newest reply when the dates change quickly', async () => {
    let releaseOld: (v: PaymentChecksView) => void = () => {};
    api.fetchPaymentChecks
      .mockImplementationOnce(() => new Promise<PaymentChecksView>((r) => { releaseOld = r; }))
      .mockImplementationOnce(async () => view());
    const { rerender } = renderTab();
    rerender(<MemoryRouter><PaymentChecksTab from="2026-10-28" to="2026-10-28" onRange={onRange} onError={vi.fn()} /></MemoryRouter>);
    await screen.findByTestId('payment-check-1', {}, { timeout: 5000 });
    releaseOld(view({ payments: [] }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('payment-check-1')).toBeInTheDocument();
  });

  it('words an empty list', () => {
    expect(emptyWords('unchecked', '', null)).toBe('Nothing to check in these days. Good job.');
    expect(emptyWords('unchecked', 'card', { qr: { count: 1, laar: 1, unchecked: 1 }, card: { count: 0, laar: 0, unchecked: 0 }, transfer: { count: 3, laar: 1, unchecked: 3 } }))
      .toBe('No Card payments to check in these days. 1 QR and 3 transfer still to check.');
  });

  it('words a difference', () => {
    expect(diffWords(-500)).toBe('Paid MVR 5.00 less');
    expect(diffWords(250)).toBe('Paid MVR 2.50 more');
  });
});
