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
const fetchTransferSettlements = vi.fn();
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchCardQrLedger: (...a: unknown[]) => fetchCardQrLedger(...a),
    fetchCashHandovers: (...a: unknown[]) => fetchCashHandovers(...a),
    saveCashHandover: (...a: unknown[]) => saveCashHandover(...a),
    uploadStatement: (...a: unknown[]) => uploadStatement(...a),
    fetchTransferSettlements: (...a: unknown[]) => fetchTransferSettlements(...a),
    fetchStatementImports: vi.fn().mockResolvedValue({ imports: [] }),
    fetchSettlementSettings: vi.fn().mockResolvedValue({ start_date: null, tolerance: 1, alert_days: 3, accounts: [{ key: 'card_qr', label: 'Card & QR account' }, { key: 'transfer', label: 'Transfer account' }], card_qr_methods: [] }),
  };
});

const ledger = {
  start: null, from: '2026-09-01', to: '2026-09-07',
  days: [
    { date: '2026-09-06', gross_laar: 10000, commission_laar: 250, expected_laar: 9750, payments: 3, allocated_laar: 6000, remaining_laar: 3750, over_laar: 0, age_days: 1, status: 'partial', deposits: [{ line_id: 1, date: '2026-09-07', amount_laar: 6000 }] },
    { date: '2026-09-04', gross_laar: 5000, commission_laar: 0, expected_laar: 5000, payments: 1, allocated_laar: 6500, remaining_laar: 0, over_laar: 1500, age_days: 3, status: 'over', deposits: [{ line_id: 2, date: '2026-09-05', amount_laar: 6500 }] },
    { date: '2026-09-02', gross_laar: 5000, commission_laar: 0, expected_laar: 5000, payments: 1, allocated_laar: 0, remaining_laar: 5000, over_laar: 0, age_days: 5, status: 'overdue', deposits: [] },
  ],
  deposits: [
    { id: 1, date: '2026-09-07', for_date: null, kind: null, description: 'POS SETTLEMENT', reference: null, amount_laar: 6000, applied_laar: 6000, excess_laar: 0, applied_to: [{ date: '2026-09-06', amount_laar: 6000 }] },
    { id: 2, date: '2026-09-05', for_date: '2026-09-04', kind: 'pos', description: 'POS Credit Transfer · terminal 000000 65018311', reference: 'FT262216QMW6\\B26', amount_laar: 6500, applied_laar: 6500, excess_laar: 0, applied_to: [{ date: '2026-09-04', amount_laar: 6500 }] },
  ],
  set_aside: [{ id: 3, date: '2026-09-05', for_date: '2026-09-05', kind: 'transfer', description: 'Transfer Credit · ASIF MOOSA IBRAHIM', reference: 'FT262230LPDP\\B26', counterparty: 'ASIF MOOSA IBRAHIM', amount_laar: 200000, match_status: 'ignored', matched_payment_id: null }],
  totals: { expected_laar: 19750, deposited_laar: 12500, outstanding_laar: 8750, excess_laar: 0, over_laar: 1500, overdue_days: 1, over_days: 1, oldest_open_date: '2026-09-02' },
  settings: { tolerance_laar: 100, alert_days: 3, start_date: null },
};

const transferLine = (id: number, amount: number, sender: string) => ({
  id, date: '2026-09-07', for_date: '2026-09-06', kind: 'transfer' as const, description: `Transfer Credit · ${sender}`, reference: `FT${id}`,
  counterparty: sender, amount_laar: amount, match_status: 'auto' as const, matched_payment_id: null,
});

const transfers = {
  payments: [
    { payment_id: 11, at: '2026-09-06T12:00:00+05:00', amount_laar: 2600, reference: null, order_number: 'ORD-11', invoice_number: null, customer: 'Azlifa Ahmed', method_label: 'Bank transfer', status: 'short', verified: false, difference_laar: -600, line: transferLine(1, 2000, 'AZLIFA AHMED') },
    { payment_id: 12, at: '2026-09-06T12:30:00+05:00', amount_laar: 18000, reference: null, order_number: 'ORD-12', invoice_number: null, customer: 'Aiman Shareef', method_label: 'Bank transfer', status: 'verified', verified: true, difference_laar: 0, line: transferLine(2, 18000, 'AIMAN SHAREEF') },
    { payment_id: 13, at: '2026-09-06T13:00:00+05:00', amount_laar: 7100, reference: null, order_number: 'ORD-13', invoice_number: null, customer: 'Fathimath Maisham', method_label: 'Bank transfer', status: 'over', verified: false, difference_laar: 400, line: transferLine(3, 7500, 'F MAISHAM') },
    { payment_id: 14, at: '2026-09-06T14:00:00+05:00', amount_laar: 9300, reference: null, order_number: 'ORD-14', invoice_number: null, customer: 'Ali Rafeeu', method_label: 'Bank transfer', status: 'unverified', verified: false, difference_laar: null, line: null },
  ],
  unmatched_lines: [{ ...transferLine(4, 5000, 'SOFOORA NAFIU MOOSA'), match_status: 'unmatched' as const }],
  totals: { payments: 4, verified: 1, unverified_laar: 9300, mismatched: 2, short_laar: 600, over_laar: 400, unmatched_lines: 1 },
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
    fetchTransferSettlements.mockResolvedValue(transfers);
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
    // The bank paid 65 for a day the till took 50 on: shown against that day, not spread.
    expect(screen.getByTestId('ledger-day-2026-09-04')).toHaveTextContent('Bank paid more');
    expect(screen.getByTestId('ledger-day-2026-09-04')).toHaveTextContent('+MVR 15.00');
  });

  it('shows which sales day each deposit was for and the credits set aside', async () => {
    renderPage();
    await screen.findByText('MVR 87.50');
    fireEvent.click(screen.getByRole('button', { name: 'Show deposits (2)' }));

    expect(screen.getByTestId('deposit-2')).toHaveTextContent('2026-09-04');
    expect(screen.getByTestId('deposit-1')).toHaveTextContent('oldest open day');
    // The owner's top-up is listed but not counted.
    expect(screen.getByTestId('set-aside-3')).toHaveTextContent('ASIF MOOSA IBRAHIM');
    expect(screen.getByTestId('set-aside-3')).toHaveTextContent('MVR 2,000.00');
    expect(screen.getByRole('button', { name: 'Count it' })).toBeInTheDocument();
  });

  it('highlights transfers where the customer sent the wrong amount, with the difference', async () => {
    renderPage();
    await screen.findByText('MVR 87.50');
    fireEvent.click(screen.getByRole('tab', { name: 'Transfers' }));

    expect(await screen.findByText('MVR 6.00 short · MVR 4.00 over · net −2.00')).toBeInTheDocument();

    const short = screen.getByTestId('transfer-11');
    expect(short).toHaveTextContent('Short by 6.00');
    expect(short).toHaveTextContent('−6.00');
    expect(short).toHaveTextContent('AZLIFA AHMED');
    expect(short).toHaveStyle({ background: 'var(--color-danger-bg)' });

    expect(screen.getByTestId('transfer-12')).toHaveTextContent('In bank');
    expect(screen.getByTestId('transfer-12')).not.toHaveStyle({ background: 'var(--color-danger-bg)' });
    expect(screen.getByTestId('transfer-13')).toHaveTextContent('Over by 4.00');
    expect(screen.getByTestId('transfer-13')).toHaveTextContent('+4.00');
    expect(screen.getByTestId('transfer-14')).toHaveTextContent('Not seen');

    // An unclaimed credit shows who sent it and when they sent it, not when the bank posted it.
    expect(screen.getByTestId('unmatched-line-4')).toHaveTextContent('2026-09-06');
    expect(screen.getByTestId('unmatched-line-4')).toHaveTextContent('posted 2026-09-07');
    expect(screen.getByTestId('unmatched-line-4')).toHaveTextContent('SOFOORA NAFIU MOOSA');
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
      account: 'card_qr', account_label: 'Card & QR account', filename: 'sept.csv', format: 'bml', columns: {}, credit_lines: 2, new_lines: 2,
      duplicate_lines: 0, debit_lines_skipped: 1, unreadable_lines: 0, set_aside_lines: 1, credit_total_laar: 30000, date_from: '2026-09-06', date_to: '2026-09-07',
      preview: [{ txn_date: '2026-09-06', for_date: '2026-09-05', kind: 'pos', description: 'POS Credit Transfer', reference: null, amount_laar: 15000, set_aside: false }],
    } });
    uploadStatement.mockResolvedValueOnce({ dry_run: false, summary: {
      account: 'card_qr', account_label: 'Card & QR account', filename: 'sept.csv', format: 'bml', columns: {}, credit_lines: 2, new_lines: 2,
      duplicate_lines: 0, debit_lines_skipped: 1, unreadable_lines: 0, set_aside_lines: 1, credit_total_laar: 30000, date_from: '2026-09-06', date_to: '2026-09-07',
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
    expect(summary).toHaveTextContent('1 credit not labelled POS set aside');
    expect(summary).toHaveTextContent('each POS credit is applied to the sales day the bank names');
    expect(uploadStatement).toHaveBeenLastCalledWith('card_qr', file, true);

    fireEvent.click(screen.getByRole('button', { name: 'Import 2 lines' }));
    await waitFor(() => expect(uploadStatement).toHaveBeenLastCalledWith('card_qr', file, false));
    expect(await screen.findByText(/^Imported/)).toBeInTheDocument();
  });
});
