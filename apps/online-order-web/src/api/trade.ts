import { ENDPOINTS } from '@shared/api';
import { API_ORIGIN, request } from './client';

export type TradeDeliveryLine = {
  id: number;
  item_name: string;
  qty_delivered: number;
  unit_price_mvr: number;
  reported_sold_qty: number | null;
};

export type TradeDelivery = {
  id: number;
  delivery_number: string;
  date: string | null;
  status: string;
  sales_reported: boolean;
  can_report_sales: boolean;
  reported_at: string | null;
  summary: string;
  lines: TradeDeliveryLine[];
};

export type TradeStatementInvoice = {
  id: number;
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  total_mvr: number;
  amount_paid_mvr: number;
  outstanding_mvr: number;
  status: string;
  is_overdue: boolean;
  can_pay: boolean;
};

export type TradeStatement = {
  balance_owed_mvr: number;
  overdue_mvr: number;
  invoices: TradeStatementInvoice[];
  payments: Array<{
    id: number;
    amount_mvr: number;
    method: string;
    paid_at: string | null;
    invoice_id: number | null;
  }>;
  entries: Array<{
    id: number;
    type: string;
    date: string | null;
    description: string | null;
    amount_mvr: number;
    direction: string;
    running_balance_mvr: number;
    invoice_id: number | null;
  }>;
};

export async function fetchTradeDeliveries(): Promise<{ data: TradeDelivery[] }> {
  return request(`${ENDPOINTS.CUSTOMER_TRADE_DELIVERIES}`);
}

export async function fetchTradeDelivery(id: number): Promise<{ delivery: TradeDelivery }> {
  return request(ENDPOINTS.CUSTOMER_TRADE_DELIVERY(id));
}

export async function reportTradeSales(
  deliveryId: number,
  payload: {
    idempotency_key: string;
    lines: Array<{ line_id: number; sold_qty: number }>;
  },
): Promise<{ delivery: TradeDelivery; message?: string }> {
  return request(ENDPOINTS.CUSTOMER_TRADE_REPORT_SALES(deliveryId), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchTradeStatement(): Promise<{ statement: TradeStatement }> {
  return request(ENDPOINTS.CUSTOMER_TRADE_STATEMENT);
}

export async function payTradeInvoice(
  invoiceId: number,
  payload: { amount_mvr?: number; idempotency_key: string },
): Promise<{ payment_url: string; payment_id: number; reused?: boolean }> {
  return request(ENDPOINTS.CUSTOMER_TRADE_INVOICE_PAY(invoiceId), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Open the authenticated invoice PDF in a new tab (session cookie). */
export async function openTradeInvoicePdf(invoiceId: number): Promise<void> {
  const res = await fetch(`${API_ORIGIN}/api${ENDPOINTS.CUSTOMER_TRADE_INVOICE_PDF(invoiceId)}`, {
    credentials: 'include',
    headers: { Accept: 'application/pdf,text/html,*/*' },
  });
  if (!res.ok) {
    throw new Error('Could not download this invoice.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
