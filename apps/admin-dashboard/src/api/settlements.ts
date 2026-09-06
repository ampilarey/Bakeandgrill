/**
 * Bank settlements — does the money in the bank match what the till says?
 *
 * Owner, 2026-09-07. Card and QR takings reach one account a day or more
 * later, sometimes in halves; transfers reach another account line by line;
 * cash is handed over. Statement lines are applied to the oldest unsettled
 * day first, so nobody guesses which day a deposit was for.
 */
import { req } from './client';

export type SettlementAccount = 'card_qr' | 'transfer';

export type DayStatus = 'none' | 'settled' | 'partial' | 'awaiting' | 'overdue';

export type LedgerDay = {
  date: string;
  gross_laar: number;
  commission_laar: number;
  expected_laar: number;
  payments: number;
  allocated_laar: number;
  remaining_laar: number;
  age_days: number;
  status: DayStatus;
  deposits: Array<{ line_id: number; date: string; amount_laar: number }>;
};

export type LedgerDeposit = {
  id: number;
  date: string;
  description: string | null;
  reference: string | null;
  amount_laar: number;
  applied_laar: number;
  excess_laar: number;
  applied_to: Array<{ date: string; amount_laar: number }>;
};

export type CardQrLedger = {
  start: string | null;
  from: string;
  to: string;
  days: LedgerDay[];
  deposits: LedgerDeposit[];
  totals: {
    expected_laar: number;
    deposited_laar: number;
    outstanding_laar: number;
    excess_laar: number;
    overdue_days: number;
    oldest_open_date: string | null;
  };
  settings: { tolerance_laar: number; alert_days: number; start_date: string | null };
};

export type StatementLine = {
  id: number;
  date: string;
  description: string | null;
  reference: string | null;
  amount_laar: number;
  match_status: 'auto' | 'manual' | 'unmatched' | 'ignored';
  matched_payment_id: number | null;
};

export type TransferRow = {
  payment_id: number;
  at: string;
  amount_laar: number;
  reference: string | null;
  order_number: string | null;
  invoice_number: string | null;
  customer: string | null;
  method_label: string;
  verified: boolean;
  line: StatementLine | null;
};

export type TransfersView = {
  payments: TransferRow[];
  unmatched_lines: StatementLine[];
  totals: { payments: number; verified: number; unverified_laar: number; unmatched_lines: number };
};

export type CashDay = {
  date: string;
  shifts: number;
  counted_laar: number;
  till_expected_laar: number;
  till_variance_laar: number;
  float_kept_laar: number;
  float_source: 'entered' | 'shift_opening';
  expected_handover_laar: number;
  received_laar: number | null;
  difference_laar: number | null;
  received_by: string | null;
  notes: string | null;
  status: 'none' | 'awaiting' | 'settled' | 'differs';
};

export type CashView = {
  days: CashDay[];
  totals: { expected_handover_laar: number; received_laar: number; awaiting_days: number; differs_days: number };
};

export type StatementImport = {
  id: number;
  account: SettlementAccount;
  account_label: string;
  filename: string;
  imported_by: string | null;
  line_count: number;
  duplicate_count: number;
  credit_total_laar: number;
  created_at: string | null;
};

export type ImportSummary = {
  account: SettlementAccount;
  account_label: string;
  filename: string;
  columns: Record<string, number>;
  credit_lines: number;
  new_lines: number;
  duplicate_lines: number;
  debit_lines_skipped: number;
  unreadable_lines: number;
  credit_total_laar: number;
  date_from: string | null;
  date_to: string | null;
  preview: Array<{ txn_date: string; description: string | null; reference: string | null; amount_laar: number }>;
  import_id?: number;
  auto_matched?: number;
};

export type SettlementSettings = {
  start_date: string | null;
  tolerance: number;
  alert_days: number;
  accounts: Array<{ key: SettlementAccount; label: string }>;
  card_qr_methods: string[];
};

const q = (from: string, to: string) => `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

export async function fetchCardQrLedger(from: string, to: string): Promise<CardQrLedger> {
  return req(`/settlements/card-qr${q(from, to)}`);
}

export async function fetchTransferSettlements(from: string, to: string): Promise<TransfersView> {
  return req(`/settlements/transfers${q(from, to)}`);
}

export async function fetchCashHandovers(from: string, to: string): Promise<CashView> {
  return req(`/settlements/cash${q(from, to)}`);
}

export async function saveCashHandover(
  date: string,
  payload: { amount: number; float_kept?: number | null; notes?: string | null },
): Promise<{ day: CashDay }> {
  return req(`/settlements/cash/${date}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function deleteCashHandover(date: string): Promise<{ message: string }> {
  return req(`/settlements/cash/${date}`, { method: 'DELETE' });
}

export async function fetchStatementImports(): Promise<{ imports: StatementImport[] }> {
  return req('/settlements/statements');
}

export async function uploadStatement(
  account: SettlementAccount,
  file: File,
  dryRun: boolean,
): Promise<{ dry_run: boolean; summary: ImportSummary }> {
  const form = new FormData();
  form.append('account', account);
  form.append('file', file);
  if (dryRun) form.append('dry_run', '1');
  return req('/settlements/statements', { method: 'POST', body: form });
}

export async function deleteStatementImport(id: number): Promise<{ message: string }> {
  return req(`/settlements/statements/${id}`, { method: 'DELETE' });
}

export async function matchTransferLine(lineId: number, paymentId: number): Promise<{ line: Partial<StatementLine> }> {
  return req(`/settlements/lines/${lineId}/match`, { method: 'POST', body: JSON.stringify({ payment_id: paymentId }) });
}

export async function unmatchTransferLine(lineId: number): Promise<{ line: Partial<StatementLine> }> {
  return req(`/settlements/lines/${lineId}/unmatch`, { method: 'POST' });
}

export async function ignoreStatementLine(lineId: number): Promise<{ line: Partial<StatementLine> }> {
  return req(`/settlements/lines/${lineId}/ignore`, { method: 'POST' });
}

export async function fetchSettlementSettings(): Promise<SettlementSettings> {
  return req('/settlements/settings');
}

export async function updateSettlementSettings(
  payload: { start_date?: string | null; tolerance?: number; alert_days?: number },
): Promise<SettlementSettings> {
  return req('/settlements/settings', { method: 'PATCH', body: JSON.stringify(payload) });
}
