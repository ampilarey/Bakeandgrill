import { ENDPOINTS } from '@shared/api';
import { request } from './client';

export type EventOrderLineInput =
  | { item_id: number; variant_id?: number; packaging_option_id?: number; quantity: number; notes?: string }
  | { custom_name: string; quantity: number; notes?: string };

/** Minimal wizard payload — contact comes from the authenticated customer. */
export type EventOrderPayload = {
  event_date: string;
  lines: EventOrderLineInput[];
  /** Optional overrides (staff/legacy clients). Defaults to pickup on the server. */
  fulfillment_method?: 'pickup' | 'delivery';
  contact_name?: string;
  phone?: string;
  email?: string;
  company?: string;
  occasion?: string;
  event_type?: string;
  fulfillment_time?: string;
  setup_time?: string;
  venue_name?: string;
  delivery_address?: string;
  delivery_island?: string;
  onsite_contact_name?: string;
  onsite_contact_phone?: string;
  headcount?: number;
  notes?: string;
  dietary_notes?: string;
};

export type EventOrderResult = {
  id: number;
  reference: string;
  status: string;
  event_date: string | null;
  fulfillment_method: string;
  lines: Array<{
    id: number;
    name: string;
    quantity: number;
    unit_price: number | null;
    is_custom: boolean;
  }>;
};

export async function createEventOrder(
  payload: EventOrderPayload,
): Promise<{ message: string; request: EventOrderResult }> {
  return request(ENDPOINTS.CUSTOMER_EVENT_ORDERS, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type CustomerEventOrder = {
  reference: string;
  status: string;
  event_date: string | null;
  fulfillment_method: string | null;
  fulfillment_time: string | null;
  venue_name: string | null;
  headcount: number | null;
  quote_token: string | null;
  quote_is_deposit: boolean;
  paid_laar: number;
  balance_laar: number;
  total_laar: number;
  created_at: string | null;
};

export type CustomerEventOrderDetail = CustomerEventOrder & {
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  occasion: string | null;
  delivery_address: string | null;
  delivery_island: string | null;
  notes: string | null;
  dietary_notes: string | null;
  lines: Array<{
    id: number;
    name: string;
    quantity: number;
    unit_price: number | null;
    notes: string | null;
    is_custom: boolean;
  }>;
};

export async function fetchMyEventOrders(): Promise<{ data: CustomerEventOrder[] }> {
  return request(ENDPOINTS.CUSTOMER_EVENT_ORDERS);
}

export async function fetchMyEventOrder(reference: string): Promise<{ data: CustomerEventOrderDetail }> {
  return request(ENDPOINTS.CUSTOMER_EVENT_ORDER_BY_REF(reference));
}
