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
  return data.slots;
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

export async function getMyReviews(token: string): Promise<{ data: CustomerReview[] }> {
  return request('/customer/reviews', { headers: { Authorization: `Bearer ${token}` } });
}
