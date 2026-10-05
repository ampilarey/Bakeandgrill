import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CreditRepaymentsView } from '../components/credit/CreditRepaymentsView';
import { renderWithRouter } from './testUtils';

/*
 * Customers → Credit accounts → Repayments (owner, 2026-10-06): every
 * repayment in a range, totals per method, and a CSV for the bank.
 */

const { api, response } = vi.hoisted(() => {
  const response = {
    from: '2026-10-06',
    to: '2026-10-06',
    method: 'all',
    rows: [
      { id: 3, at: '2026-10-06 23:50', date: '2026-10-06', customer_id: 2, customer: 'Hassan', phone: '+9607772222', channel: 'retail', method: 'bank_transfer', method_label: 'Bank transfer', amount_mvr: 200, balance_after_mvr: 0, reference: 'BML ref 99812', invoices: ['INV-1'], recorded_by: 'Owner', shift_id: null },
      { id: 2, at: '2026-10-06 18:00', date: '2026-10-06', customer_id: 2, customer: 'Corner Shop', phone: null, channel: 'wholesale', method: 'online', method_label: 'Online (BML)', amount_mvr: 30, balance_after_mvr: 0, reference: null, invoices: [], recorded_by: 'Online', shift_id: null },
      { id: 1, at: '2026-10-06 09:15', date: '2026-10-06', customer_id: 1, customer: 'Aisha', phone: '+9607771111', channel: 'retail', method: 'cash', method_label: 'Cash', amount_mvr: 100, balance_after_mvr: 50, reference: null, invoices: [], recorded_by: 'Owner', shift_id: 7 },
    ],
    totals: {
      count: 3,
      total_mvr: 330,
      not_cash_mvr: 230,
      by_method: [
        { method: 'cash', label: 'Cash', count: 1, total_mvr: 100 },
        { method: 'card', label: 'Card (machine)', count: 0, total_mvr: 0 },
        { method: 'bank_transfer', label: 'Bank transfer', count: 1, total_mvr: 200 },
        { method: 'online', label: 'Online (BML)', count: 1, total_mvr: 30 },
      ],
    },
    truncated: false,
  };
  return { response, api: { fetchCreditRepayments: vi.fn(), exportCreditRepayments: vi.fn() } };
});

vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));
vi.mock('../api', () => ({
  fetchCreditRepayments: (...a: unknown[]) => api.fetchCreditRepayments(...a),
  exportCreditRepayments: (...a: unknown[]) => api.exportCreditRepayments(...a),
}));

describe('CreditRepaymentsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchCreditRepayments.mockResolvedValue(response);
    api.exportCreditRepayments.mockResolvedValue(new Blob(['a,b'], { type: 'text/csv' }));
  });

  it('lists the day with totals and the figure to match at the bank', async () => {
    renderWithRouter(<CreditRepaymentsView />);

    expect(await screen.findAllByTestId('credit-repayment-row')).toHaveLength(3);
    const call = api.fetchCreditRepayments.mock.calls[0][0];
    expect(call.from).toBe(call.to);
    expect(call.method).toBe('all');

    expect(screen.getByText('Not cash: match to bank')).toBeInTheDocument();
    expect(screen.getByText('MVR 230.00')).toBeInTheDocument();
    expect(screen.getByText('MVR 330.00')).toBeInTheDocument();

    const [first, second] = screen.getAllByTestId('credit-repayment-row');
    expect(within(first).getByText('BML ref 99812')).toBeInTheDocument();
    expect(within(first).getByText('INV-1')).toBeInTheDocument();
    expect(within(second).getByText(/wholesale/)).toBeInTheDocument();
    expect(within(second).getByText('Online (BML)')).toBeInTheDocument();
  });

  it('filters by method and by range', async () => {
    renderWithRouter(<CreditRepaymentsView />);
    await screen.findAllByTestId('credit-repayment-row');

    fireEvent.click(screen.getByRole('tab', { name: 'Bank transfer 1' }));
    await waitFor(() => expect(api.fetchCreditRepayments).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'bank_transfer' })));

    fireEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await waitFor(() => {
      const calls = api.fetchCreditRepayments.mock.calls;
      const last = calls[calls.length - 1][0];
      expect(last.from < last.to).toBe(true);
    });
  });

  it('downloads the CSV for the same filters', async () => {
    const createUrl = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revoke });
    renderWithRouter(<CreditRepaymentsView />);
    await screen.findAllByTestId('credit-repayment-row');

    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(api.exportCreditRepayments).toHaveBeenCalledWith(expect.objectContaining({ method: 'all' })));
    expect(createUrl).toHaveBeenCalled();
  });
});
