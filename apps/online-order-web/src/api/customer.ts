// ── Customer Account — Reservations, Favourites, Pre-orders, Reviews ──────────
import { request } from './client';

// ── Opening hours ──────────────────────────────────────────────────────────────

import { ENDPOINTS } from '@shared/api';
import type { OpeningHoursStatus } from '@shared/types';

export type DaySchedule = { open: string; close: string; closed?: boolean };

export async function fetchOpeningHoursStatus(): Promise<OpeningHoursStatus> {
  return request<OpeningHoursStatus>(ENDPOINTS.OPENING_HOURS_STATUS);
}

export async function fetchOpeningHoursSchedule(): Promise<{
  schedule: Record<string, DaySchedule>;
  open: boolean;
  closure_reason: string | null;
}> {
  return request(ENDPOINTS.OPENING_HOURS_SCHEDULE);
}

// ── Pre-orders ─────────────────────────────────────────────────────────────────

export type PreOrderPayload = {
  items: Array<{ item_id: number; quantity: number }>;
  fulfillment_date: string;
  customer_notes?: string;
};

export type PreOrderResult = {
  id: number;
  order_number: string;
  items: Array<{ item_id: number; name: string; quantity: number; price: number; total: number }>;
  subtotal: number;
  total: number;
  fulfillment_date: string;
  status: string;
};

export async function createPreOrder(token: string, payload: PreOrderPayload): Promise<{ pre_order: PreOrderResult }> {
  return request<{ pre_order: PreOrderResult }>(ENDPOINTS.CUSTOMER_PRE_ORDERS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

// ── Reservations ───────────────────────────────────────────────────────────────

export type ReservationSlot = { time_slot: string; available: boolean };

export interface CustomerReservation {
  id: number;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  date: string;
  time_slot: string;
  status: string;
  notes: string | null;
  created_at: string;
  table?: { id: number; name: string } | null;
}

export async function fetchReservationSlots(date: string, partySize: number): Promise<ReservationSlot[]> {
  const data = await request<{ slots: ReservationSlot[] }>(
    `${ENDPOINTS.RESERVATIONS_AVAILABILITY}?date=${date}&party_size=${partySize}`,
  );
  return data.slots ?? [];
}

export async function createReservation(payload: {
  customer_name: string;
  customer_phone: string;
  party_size: number;
  date: string;
  time_slot: string;
  notes?: string;
}): Promise<CustomerReservation> {
  const data = await request<{ reservation: CustomerReservation }>(ENDPOINTS.RESERVATIONS, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.reservation;
}

export async function getMyReservations(token: string): Promise<{ data: CustomerReservation[] }> {
  return request('/reservations', { headers: { Authorization: `Bearer ${token}` } });
}

export async function cancelMyReservation(token: string, id: number): Promise<void> {
  await request<void>(`/reservations/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

// ── Favourites ─────────────────────────────────────────────────────────────────

export interface FavouriteItem {
  id: number;
  name: string;
  base_price: number;
  image_url: string | null;
  category: string | null;
  is_available: boolean;
}

export async function getMyFavourites(token: string): Promise<{ data: FavouriteItem[] }> {
  return request('/customer/favorites', { headers: { Authorization: `Bearer ${token}` } });
}

export async function toggleFavourite(token: string, itemId: number): Promise<{ is_favourite: boolean }> {
  return request(`/customer/favorites/${itemId}/toggle`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
}

// ── Pre-order History ──────────────────────────────────────────────────────────

export interface CustomerPreOrder {
  id: number;
  order_number: string;
  event_name: string | null;
  event_date: string | null;
  status: string;
  total: number;
  created_at: string;
}

export async function getMyPreOrders(token: string): Promise<{ data: CustomerPreOrder[] }> {
  return request('/customer/pre-orders', { headers: { Authorization: `Bearer ${token}` } });
}

// ── Reviews ────────────────────────────────────────────────────────────────────

export interface CustomerReview {
  id: number;
  rating: number;
  comment: string | null;
  is_anonymous: boolean;
  status: string;
  created_at: string;
  item?: { id: number; name: string } | null;
  order?: { id: number; order_number: string } | null;
}

export async function submitReview(
  token: string,
  payload: { order_id: number; rating: number; comment: string; is_anonymous: boolean },
): Promise<void> {
  await request<void>(ENDPOINTS.REVIEWS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function getMyReviews(
  token: string,
  params: { page?: number; per_page?: number } = {},
): Promise<{
  data: CustomerReview[];
  meta?: { current_page: number; last_page: number; per_page: number; total: number };
}> {
  // ONL-004: explicit per_page cap. The backend will paginate either
  // way; without us asking for a page we got the first ~15 reviews
  // forever and customers thought the rest were gone.
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  q.set('per_page', String(params.per_page ?? 20));
  return request(`/customer/reviews?${q.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Credit account ────────────────────────────────────────────────────────────

export type CustomerCreditSummary = {
  enabled: boolean;
  status: 'active' | 'on_hold' | 'blocked' | string;
  limit_mvr: number;
  balance_mvr: number;
  available_mvr: number;
  payment_terms_days: number;
  reminder_sms_enabled: boolean;
  next_payment_due_date: string | null;
};

export type CustomerCreditInvoice = {
  id: number;
  invoice_number: string;
  order_id: number | null;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  total_mvr: number;
  amount_paid_mvr: number;
  balance_due_mvr: number;
  view_url: string | null;
};

export async function getCustomerCredit(token: string): Promise<{
  credit: (CustomerCreditSummary & { open_invoices: CustomerCreditInvoice[] }) | null;
}> {
  return request('/customer/credit', { headers: { Authorization: `Bearer ${token}` } });
}

export async function updateCustomerCreditPreferences(
  token: string,
  data: { credit_reminder_sms: boolean },
): Promise<{
  credit: CustomerCreditSummary & { open_invoices: CustomerCreditInvoice[] };
}> {
  return request('/customer/credit/preferences', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
}
