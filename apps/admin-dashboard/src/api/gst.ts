import { downloadBlob } from '@shared/api';
import { req, requestBlob } from './client';

export interface GstSettings {
  gst_registered: boolean;
  seller_name: string | null;
  seller_address: string | null;
  seller_tin: string | null;
  taxable_activity_no: string | null;
  sector: 'general' | 'tourism';
  default_tax_rate_bp: number;
  tax_inclusive: boolean;
  taxable_period: 'monthly' | 'quarterly';
  accounting_basis: 'invoice' | 'payment' | 'hybrid';
  currency: string;
  invoice_prefix: string;
  credit_note_prefix: string;
  invoice_sequence_mode: string;
  next_invoice_sequence: number;
  next_credit_note_sequence: number;
  lock_after_export: boolean;
  legal_default_note?: string;
  hybrid_note?: string;
}

export interface GstSummary {
  period: string;
  business_tin: string | null;
  taxable_activity_no: string | null;
  net_gst_payable_laar: number;
  gst_on_standard_sales_laar: number;
  claimable_input_revenue_laar: number;
  claimable_input_capital_laar: number;
  credit_note_refund_adjustments_laar: number;
  standard_rated_sales_ex_gst_laar: number;
  warnings: { type: string; message: string; reference?: string }[];
  locked: boolean;
  counts: Record<string, number>;
}

export async function getGstSettings(): Promise<{ settings: GstSettings }> {
  return req('/admin/gst/settings');
}

export async function updateGstSettings(data: Partial<GstSettings>): Promise<{ settings: GstSettings; message: string }> {
  return req('/admin/gst/settings', { method: 'PUT', body: JSON.stringify(data) });
}

export async function getGstSummary(period: string): Promise<GstSummary> {
  return req(`/reports/finance/gst/summary?period=${encodeURIComponent(period)}`);
}

export async function getGstReconciliation(period: string): Promise<{ period: string; warnings: GstSummary['warnings'] }> {
  return req(`/reports/finance/gst/reconciliation?period=${encodeURIComponent(period)}`);
}

export async function getGstOutputStatement(period: string): Promise<unknown> {
  return req(`/reports/finance/gst/output-statement?period=${encodeURIComponent(period)}`);
}

export async function getGstInputStatement(period: string): Promise<unknown> {
  return req(`/reports/finance/gst/input-statement?period=${encodeURIComponent(period)}`);
}

export async function lockGstPeriod(period: string): Promise<{ message: string }> {
  return req(`/reports/finance/gst/periods/${encodeURIComponent(period)}/lock`, { method: 'POST' });
}

export async function downloadGstExport(path: string, period: string, filename: string): Promise<void> {
  const blob = await requestBlob(`${path}?period=${encodeURIComponent(period)}`);
  downloadBlob(blob, filename);
}

export async function downloadGstSummaryCsv(period: string): Promise<void> {
  return downloadGstExport('/reports/finance/gst/export/summary.csv', period, `gst-summary-${period}.csv`);
}

export async function downloadGstOutputXlsx(period: string): Promise<void> {
  return downloadGstExport('/reports/finance/gst/export/output-statement.xlsx', period, `output-tax-${period}.xlsx`);
}

export async function downloadGstInputXlsx(period: string): Promise<void> {
  return downloadGstExport('/reports/finance/gst/export/input-statement.xlsx', period, `input-tax-${period}.xlsx`);
}

export async function downloadGstLedgerCsv(period: string): Promise<void> {
  return downloadGstExport('/reports/finance/gst/export/ledger.csv', period, `gst-ledger-${period}.csv`);
}

export type GstLedgerEntry = {
  id: number;
  document_no: string;
  document_date: string;
  source_type: string;
  direction: string;
  tax_code: string;
  taxable_value_laar: number;
  tax_laar: number;
  total_laar: number;
  is_tax_invoice?: boolean;
  is_claimable?: boolean;
};

export async function getGstLedger(period: string, page = 1): Promise<{
  period: string;
  data: GstLedgerEntry[];
  meta: { current_page: number; last_page: number; total: number };
}> {
  return req(`/reports/finance/gst/ledger?period=${encodeURIComponent(period)}&page=${page}`);
}

export async function postGstManualAdjustment(data: {
  period_key: string;
  document_no: string;
  document_date: string;
  tax_code: string;
  taxable_value_laar: number;
  tax_laar: number;
  total_laar: number;
  reason: string;
}): Promise<{ message: string; entry: GstLedgerEntry }> {
  return req('/reports/finance/gst/manual-adjustment', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
