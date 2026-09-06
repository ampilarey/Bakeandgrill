import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SettlementsPage } from '../pages/SettlementsPage';

/*
 * Owner, 2026-09-07: "the system must match actual money received." The
 * page shows, per day, whether the bank has paid what the till says it
 * should, lets the owner record the cash they took, and reads a statement
 * back before storing it.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }));

const fetchCardQrLedger = vi.fn();
const fetchCashHandovers = vi.fn();
const saveCashHandover = vi.fn();
const uploadStatement = vi.fn();
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchCardQrLedger: (...a: unknown[]) => fetchCardQrLedger(...a),
    fetchCashHandovers: (...a: unknown[]) => fetchCashHandovers(...a),
    saveCashHandover: (...a: unknown[]) => saveCashHandover(...a),
    uploadStatement: (...a: unknown[]) => uploadStatement(...a),
    fetchTransferSettlements: vi.fn().mockResolvedValue({ payments: [], unmatched_lines: [], totals: { payments: 0, verified: 0, unverified_laar: 0, unmatched_lines: 0 } }),
    fetchStatementImports: vi.fn().mockResolvedValue({ imports: [] }),
    fetchSettlementSettings: vi.fn().mockResolvedValue({ start_date: null, tolerance: 1, alert_days: 3, accounts: [{ key: 'card_qr', label: 'Card & QR account' }, { key: 'transfer', label: 'Transfer account' }], card_qr_methods: [] }),
  };
});

const ledger = {
  start: null, from: '2026-09-01', to: '2026-09-07',
  days: [
    { date: '2026-09-06', gross_laar: 10000, commission_laar: 250, expected_laar: 9750, payments: 3, allocated_laar: 6000, remaining_laar: 3750, age_days: 1, status: 'partial', deposits: [{ line_id: 1, date: '2026-09-07', amount_laar: 6000 }] },
    { date: '2026-09-02', gross_laar: 5000, commission_laar: 0, expected_laar: 5000, payments: 1, allocated_laar: 0, remaining_laar: 5000, age_days: 5, status: 'overdue', deposits: [] },
  ],
  deposits: [{ id: 1, date: '2026-09-07', description: 'POS SETTLEMENT', reference: null, amount_laar: 6000, applied_laar: 6000, excess_laar: 0, applied_to: [{ date: '2026-09-06', amount_laar: 6000 }] }],
  totals: { expected_laar: 14750, deposited_laar: 6000, outstanding_laar: 8750, excess_laar: 0, overdue_days: 1, oldest_open_date: '2026-09-02' },
  settings: { tolerance_laar: 100, alert_days: 3, start_date: null },
};

const cashDay = {
  date: '2026-09-07', shifts: 1, counted_laar: 230000, till_expected_laar: 225000, till_variance_laar: 5000,
  float_kept_laar: 50000, float_source: 'shift_opening', expected_handover_laar: 180000,
  received_laar: null, difference_laar: null, received_by: null, notes: null, status: 'awaiting',
};

function renderPage() {
  return render(<MemoryRouter><SettlementsPage /></MemoryRouter>);
}

describe('Bank settlements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCardQrLedger.mockResolvedValue(ledger);
    fetchCashHandovers.mockResolvedValue({ days: [cashDay], totals: { expected_handover_laar: 180000, received_laar: 0, awaiting_days: 1, differs_days: 0 } });
    saveCashHandover.mockResolvedValue({ day: { ...cashDay, received_laar: 180000, difference_laar: 0, status: 'settled' } });
  });

  it('says what the bank still owes and which days are partly settled or overdue', async () => {
    renderPage();
    expect(await screen.findByText('MVR 87.50')).toBeInTheDocument();
    expect(screen.getByText('oldest open day 2026-09-02')).toBeInTheDocument();
    expect(screen.getByTestId('ledger-day-2026-09-06')).toHaveTextContent('Partly settled');
    expect(screen.getByTestId('ledger-day-2026-09-06')).toHaveTextContent('2026-09-07: MVR 60.00');
    expect(screen.getByTestId('ledger-day-2026-09-02')).toHaveTextContent('Overdue');
  });

  it('records the cash the owner took against the count less the float', async () => {
    renderPage();
    await screen.findByText('MVR 87.50');
    fireEvent.click(screen.getByRole('tab', { name: 'Cash' }));

    const row = await screen.findByTestId('cash-day-2026-09-07');
    expect(row).toHaveTextContent('MVR 1,800.00');
    expect(row).toHaveTextContent('Awaiting');

    fireEvent.click(screen.getByRole('button', { name: 'Enter' }));
    // Pre-filled with what the owner should have received.
    expect(screen.getByTestId('cash-amount')).toHaveValue(1800);
    fireEvent.change(screen.getByTestId('cash-amount'), { target: { value: '1750' } });
    fireEvent.change(screen.getByTestId('cash-float'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveCashHandover).toHaveBeenCalledWith('2026-09-07', { amount: 1750, float_kept: 300, notes: null }));
  });

  it('reads a statement back before storing it', async () => {
    uploadStatement.mockResolvedValueOnce({ dry_run: true, summary: {
      account: 'card_qr', account_label: 'Card & QR account', filename: 'sept.csv', columns: {}, credit_lines: 2, new_lines: 2,
      duplicate_lines: 0, debit_lines_skipped: 1, unreadable_lines: 0, credit_total_laar: 30000, date_from: '2026-09-06', date_to: '2026-09-07',
      preview: [{ txn_date: '2026-09-06', description: 'POS SETTLEMENT', reference: null, amount_laar: 15000 }],
    } });
    uploadStatement.mockResolvedValueOnce({ dry_run: false, summary: {
      account: 'card_qr', account_label: 'Card & QR account', filename: 'sept.csv', columns: {}, credit_lines: 2, new_lines: 2,
      duplicate_lines: 0, debit_lines_skipped: 1, unreadable_lines: 0, credit_total_laar: 30000, date_from: '2026-09-06', date_to: '2026-09-07',
      preview: [], import_id: 7,
    } });

    renderPage();
    await screen.findByText('MVR 87.50');
    fireEvent.click(screen.getByRole('tab', { name: 'Statements' }));

    const file = new File(['Date,Credit\n'], 'sept.csv', { type: 'text/csv' });
    fireEvent.change(await screen.findByLabelText('Statement file'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Check file' }));

    const summary = await screen.findByTestId('import-summary');
    expect(summary).toHaveTextContent('Ready to import');
    expect(summary).toHaveTextContent('2 new credit lines totalling MVR 300.00');
    expect(summary).toHaveTextContent('1 debit line ignored');
    expect(uploadStatement).toHaveBeenLastCalledWith('card_qr', file, true);

    fireEvent.click(screen.getByRole('button', { name: 'Import 2 lines' }));
    await waitFor(() => expect(uploadStatement).toHaveBeenLastCalledWith('card_qr', file, false));
    expect(await screen.findByText(/^Imported/)).toBeInTheDocument();
  });
});
