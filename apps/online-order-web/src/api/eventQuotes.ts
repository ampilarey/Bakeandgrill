import { ENDPOINTS } from '@shared/api';
import { API_BASE_URL } from './client';

export type PublicEventQuote = {
  reference: string;
  status: string;
  contact_name: string;
  event_type?: string | null;
  event_date: string | null;
  fulfillment_method: string;
  fulfillment_time: string | null;
  setup_time?: string | null;
  venue_name?: string | null;
  delivery_address?: string | null;
  delivery_island?: string | null;
  onsite_contact_name?: string | null;
  onsite_contact_phone?: string | null;
  headcount?: number | null;
  dietary_notes?: string | null;
  quote_version: number;
  quote_expires_at: string | null;
  quote_payment_laar: number | null;
  quote_is_deposit: boolean;
  subtotal_laar: number;
  tax_laar: number;
  total_laar: number;
  tax_inclusive: boolean;
  lines: Array<{
    name: string;
    quantity: number;
    unit_price: number | null;
    notes: string | null;
    is_custom: boolean;
  }>;
};

export type QuoteFetchResult =
  | { ok: true; quote: PublicEventQuote }
  | { ok: false; status: number; message: string; expired?: boolean; reference?: string };

function mvrFromLaar(laar: number): string {
  return (laar / 100).toFixed(2);
}

export { mvrFromLaar };

export async function fetchEventQuote(token: string): Promise<QuoteFetchResult> {
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.EVENT_QUOTE}/${encodeURIComponent(token)}`, {
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({})) as {
    message?: string;
    expired?: boolean;
    reference?: string;
    quote?: PublicEventQuote;
  };
  if (res.status === 410) {
    return {
      ok: false,
      status: 410,
      message: body.message || 'This quote has expired.',
      expired: true,
      reference: body.reference,
    };
  }
  if (!res.ok || !body.quote) {
    return {
      ok: false,
      status: res.status,
      message: body.message || 'Quote not found.',
    };
  }
  return { ok: true, quote: body.quote };
}

export async function approveEventQuote(token: string): Promise<{
  payment_url: string;
  payment_id: number;
  order_number: string;
  reference: string;
}> {
  const res = await fetch(`${API_BASE_URL}${ENDPOINTS.EVENT_QUOTE}/${encodeURIComponent(token)}/approve`, {
    method: 'POST',
    credentials: 'omit',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = await res.json().catch(() => ({})) as {
    message?: string;
    payment_url?: string;
    payment_id?: number;
    order_number?: string;
    reference?: string;
  };
  if (!res.ok || !body.payment_url) {
    throw new Error(body.message || 'Could not start payment.');
  }
  return {
    payment_url: body.payment_url,
    payment_id: body.payment_id ?? 0,
    order_number: body.order_number ?? '',
    reference: body.reference ?? '',
  };
}
