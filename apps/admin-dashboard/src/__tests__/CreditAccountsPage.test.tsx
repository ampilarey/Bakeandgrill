import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CreditAccountsPage } from '../pages/CreditAccountsPage';
import { renderWithRouter } from './testUtils';

/*
 * Customers → Credit accounts (owner, 2026-10-05). The page lists every
 * account with its balance and overdue state, filters by chip, and texts a
 * reminder or a pay link from the row.
 */

const { rows, totals, api } = vi.hoisted(() => {
  const rows = [
    {
      id: 1, name: 'Aisha', phone: '+9607771111', sms_opt_out: false, reminder_sms: true,
      enabled: true, status: 'active', limit_mvr: 5000, balance_mvr: 150, available_mvr: 4850,
      terms_days: 14, open_invoices: 2, overdue_invoices: 1, overdue_mvr: 120,
      oldest_due_date: '2026-09-30', last_paid_at: null, last_charged_at: '2026-09-15T10:00:00Z', approved_at: '2026-09-01',
    },
    {
      id: 2, name: 'Quiet Qasim', phone: '+9607772222', sms_opt_out: true, reminder_sms: true,
      enabled: true, status: 'on_hold', limit_mvr: 1000, balance_mvr: 40, available_mvr: 960,
      terms_days: 30, open_invoices: 0, overdue_invoices: 0, overdue_mvr: 0,
      oldest_due_date: null, last_paid_at: '2026-09-20T09:00:00Z', last_charged_at: null, approved_at: '2026-08-01',
    },
  ];
  const totals = { accounts: 2, active: 1, on_hold: 1, blocked: 0, with_balance: 2, overdue: 1, balance_mvr: 190, overdue_mvr: 120 };
  const api = {
    fetchCreditAccounts: vi.fn(),
    sendCreditReminder: vi.fn(),
    sendCreditPayLink: vi.fn(),
    updateCustomerCredit: vi.fn(),
  };
  return { rows, totals, api };
});

vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({
    can: (slug?: string) => slug === 'customers.credit.manage' || slug === 'customers.credit.repay',
    user: null,
    loading: false,
  }),
}));

vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));

vi.mock('../components/CustomerCreditSection', () => ({
  CustomerCreditSection: ({ customerId }: { customerId: number }) => <div data-testid="credit-section">section for {customerId}</div>,
}));

vi.mock('../api', () => ({
  fetchCreditAccounts: (...args: unknown[]) => api.fetchCreditAccounts(...args),
  sendCreditReminder: (...args: unknown[]) => api.sendCreditReminder(...args),
  sendCreditPayLink: (...args: unknown[]) => api.sendCreditPayLink(...args),
  updateCustomerCredit: (...args: unknown[]) => api.updateCustomerCredit(...args),
}));

describe('CreditAccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchCreditAccounts.mockResolvedValue({ data: rows, total: 2, page: 1, per_page: 50, totals });
    api.sendCreditReminder.mockResolvedValue({ message: 'Reminder sent.', sms_log: { id: 1, status: 'sent' } });
    api.sendCreditPayLink.mockResolvedValue({ message: 'Pay link sent.', sms_log: { id: 2, status: 'sent' } });
    api.updateCustomerCredit.mockResolvedValue({ customer: {} });
  });

  it('lists every account with balance, overdue and totals', async () => {
    renderWithRouter(<CreditAccountsPage />);

    expect(await screen.findAllByTestId('credit-account-row')).toHaveLength(2);
    expect(api.fetchCreditAccounts).toHaveBeenCalledWith('all', '', 1);

    const aisha = screen.getAllByTestId('credit-account-row')[0];
    expect(within(aisha).getByText('MVR 150.00')).toBeInTheDocument();
    expect(within(aisha).getByText('MVR 120.00')).toBeInTheDocument();
    expect(within(aisha).getByText(/1 invoice, \d+ days late/)).toBeInTheDocument();
    expect(within(aisha).getByText('Active')).toBeInTheDocument();
    expect(within(aisha).getByText('Never')).toBeInTheDocument();

    expect(screen.getByText('Owed to you')).toBeInTheDocument();
    expect(screen.getByText('MVR 190.00')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overdue 1' })).toBeInTheDocument();
  });

  it('filter chips and search re-query the list', async () => {
    renderWithRouter(<CreditAccountsPage />);
    await screen.findAllByTestId('credit-account-row');

    fireEvent.click(screen.getByRole('tab', { name: 'Overdue 1' }));
    await waitFor(() => expect(api.fetchCreditAccounts).toHaveBeenLastCalledWith('overdue', '', 1));

    fireEvent.change(screen.getByLabelText('Search credit accounts'), { target: { value: '7772' } });
    await waitFor(() => expect(api.fetchCreditAccounts).toHaveBeenLastCalledWith('overdue', '7772', 1));
  });

  it('sends a reminder with optional custom wording', async () => {
    renderWithRouter(<CreditAccountsPage />);
    const aisha = (await screen.findAllByTestId('credit-account-row'))[0];

    fireEvent.click(within(aisha).getByRole('button', { name: 'Remind' }));
    expect(await screen.findByText('Remind Aisha')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your own wording (optional)'), { target: { value: 'Hi {{name}}, please pay {{balance}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reminder' }));

    await waitFor(() => expect(api.sendCreditReminder).toHaveBeenCalledWith(1, 'Hi {{name}}, please pay {{balance}}'));
    expect(await screen.findByRole('status')).toHaveTextContent('Aisha: Reminder sent.');
  });

  it('sends a pay link after confirming, and disables texting for an opted-out customer', async () => {
    renderWithRouter(<CreditAccountsPage />);
    const [aisha, qasim] = await screen.findAllByTestId('credit-account-row');

    expect(within(qasim).getByRole('button', { name: 'Remind' })).toBeDisabled();
    expect(within(qasim).getByRole('button', { name: 'Pay link' })).toBeDisabled();
    expect(within(qasim).getByText(/no SMS/)).toBeInTheDocument();

    fireEvent.click(within(aisha).getByRole('button', { name: 'Pay link' }));
    expect(await screen.findByText('Send pay link to Aisha')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send pay link' }));

    await waitFor(() => expect(api.sendCreditPayLink).toHaveBeenCalledWith(1));
    expect(await screen.findByRole('status')).toHaveTextContent('Aisha: Pay link sent.');
  });

  it('puts an account on hold or reactivates it from the row, and shows the server error', async () => {
    api.updateCustomerCredit.mockRejectedValueOnce(new Error('This customer credit account is on hold.'));
    renderWithRouter(<CreditAccountsPage />);
    const [aisha, qasim] = await screen.findAllByTestId('credit-account-row');

    fireEvent.click(within(aisha).getByRole('button', { name: 'Hold' }));
    await waitFor(() => expect(api.updateCustomerCredit).toHaveBeenCalledWith(1, { action: 'set_status', credit_status: 'on_hold' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Aisha: This customer credit account is on hold.');

    fireEvent.click(within(qasim).getByRole('button', { name: 'Reactivate' }));
    await waitFor(() => expect(api.updateCustomerCredit).toHaveBeenCalledWith(2, { action: 'set_status', credit_status: 'active' }));
  });

  it('opens the full credit section for an account', async () => {
    renderWithRouter(<CreditAccountsPage />);
    const aisha = (await screen.findAllByTestId('credit-account-row'))[0];

    fireEvent.click(within(aisha).getByRole('button', { name: 'Open' }));
    expect(await screen.findByTestId('credit-section')).toHaveTextContent('section for 1');
  });
});
