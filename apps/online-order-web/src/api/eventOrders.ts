import { ENDPOINTS } from '@shared/api';
import { request } from './client';

export type EventOrderLineInput =
  | { item_id: number; variant_id?: number; quantity: number; notes?: string }
  | { custom_name: string; quantity: number; notes?: string };

export type EventOrderPayload = {
  contact_name: string;
  phone: string;
  email?: string;
  company?: string;
  occasion?: string;
  event_type?: string;
  event_date: string;
  fulfillment_method: 'pickup' | 'delivery';
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
  lines: EventOrderLineInput[];
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
