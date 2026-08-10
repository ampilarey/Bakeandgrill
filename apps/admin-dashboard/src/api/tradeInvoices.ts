import { req } from './client';
import type { TradeExposure } from './tradeDeliveries';

export type ReadyToInvoiceDelivery = {
  id: number;
  delivery_number: string;
  status: string;
  reconciled_at: string | null;
  stamped_value_laar: number;
  invoiceable_laar: number;
  has_mismatch: boolean;
  mismatch_blocking: boolean;
  missing_qty: number;
  missing_blocking: boolean;
  self_reconciled?: boolean;
  lines_count?: number;
};

export type TradeInvoicePreview = {
  total_laar: number;
  sold_laar: number;
  missing_laar: number;
  total_mvr?: string;
  blocked: Array<{
    delivery_id: number;
    delivery_number: string;
    message: string;
  }>;
  lines: Array<{
    item_id: number | null;
    description: string;
    quantity: number;
    unit_price_laar: number;
    unit_price: number;
    total_laar: number;
    total: number;
    kind?: string;
    tax_rate_bp?: number;
  }>;
};

export type TradeInvoice = {
  id: number;
  invoice_number: string;
  status: string;
  total_laar: number;
  total: number;
  amount_paid_laar?: number;
  balance_laar?: number;
  issue_date: string;
  due_date: string | null;
  gst_period_key: string | null;
  gst_period_differs_from_issue?: boolean;
  recipient_phone?: string | null;
  customer_id?: number;
  trade_account_id?: number;
  notes?: string | null;
};

export type TradeStatementInvoice = {
  id: number;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  total_laar: number;
  amount_paid_laar: number;
  balance_laar: number;
  status: string;
  is_overdue: boolean;
};

export type TradeStatementPayment = {
  id: number;
  amount_laar: number;
  method: string;
  processed_at: string;
  reference_number: string | null;
  invoice_ids: number[];
  notes?: string | null;
};

export type TradeStatementEntry = {
  id: string;
  type: 'invoice' | 'payment' | 'credit_note' | 'adjustment';
  date: string;
  description: string;
  debit_laar: number;
  credit_laar: number;
  running_balance_laar: number;
  invoice_id?: number;
  payment_id?: number;
};

export type TradeStatement = {
  exposure: TradeExposure;
  balance_owed_laar: number;
  holding_unbilled_laar: number;
  overdue_laar: number;
  invoices: TradeStatementInvoice[];
  payments: TradeStatementPayment[];
  entries?: TradeStatementEntry[];
};

export async function fetchReadyToInvoice(
  accountId: number,
): Promise<{ data: ReadyToInvoiceDelivery[] }> {
  return req(`/admin/trade-accounts/${accountId}/ready-to-invoice`);
}

export async function previewTradeInvoice(
  accountId: number,
  deliveryIds: number[],
): Promise<{ preview: TradeInvoicePreview }> {
  return req(`/admin/trade-accounts/${accountId}/invoices/preview`, {
    method: 'POST',
    body: JSON.stringify({ delivery_ids: deliveryIds }),
  });
}

export async function raiseTradeInvoice(
  accountId: number,
  data: {
    delivery_ids: number[];
    idempotency_key: string;
    notes?: string;
  },
): Promise<{ invoice: TradeInvoice }> {
  return req(`/admin/trade-accounts/${accountId}/invoices`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function resolveMismatch(
  deliveryId: number,
  data: { decision: string },
): Promise<{ delivery: { id: number; delivery_number: string; mismatch_blocking: boolean } }> {
  return req(`/trade/deliveries/${deliveryId}/resolve-mismatch`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function waiveMissing(
  deliveryId: number,
  data: { reason: string },
): Promise<{ delivery: { id: number; delivery_number: string; missing_blocking: boolean } }> {
  return req(`/trade/deliveries/${deliveryId}/waive-missing`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchTradeStatement(accountId: number): Promise<{ statement: TradeStatement }> {
  return req(`/admin/trade-accounts/${accountId}/statement`);
}

export async function recordTradePayment(
  accountId: number,
  data: {
    customer_id: number;
    amount_laar: number;
    method: 'cash' | 'card' | 'bank_transfer';
    idempotency_key: string;
    invoice_ids?: number[];
    reference?: string;
    notes?: string;
  },
): Promise<{ payment: { id: number; amount_laar: number }; statement?: TradeStatement }> {
  return req(`/admin/trade-accounts/${accountId}/payments`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function createTradeCreditNote(
  invoiceId: number,
  data: { credit_note_reason: string },
): Promise<{ credit_note: TradeInvoice; invoice: TradeInvoice }> {
  return req(`/admin/trade-invoices/${invoiceId}/credit-note`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
