import { req, BASE } from './client';

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
  const token = localStorage.getItem('admin_token');
  const url = `${BASE}${path}?period=${encodeURIComponent(period)}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
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
