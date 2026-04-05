import { req } from './client';
import type { Order } from './orders';

export interface AdminCustomer {
  id: number;
  name: string | null;
  phone: string;
  email: string | null;
  tier: string | null;
  loyalty_points: number;
  is_active: boolean;
  is_profile_complete: boolean;
  sms_opt_out: boolean;
  internal_notes: string | null;
  preferred_language: string | null;
  orders_count: number;
  last_login_at: string | null;
  last_order_at: string | null;
  created_at: string;
}

export async function fetchAdminCustomers(params?: {
  search?: string;
  is_active?: boolean;
  page?: number;
}): Promise<{ data: AdminCustomer[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.search)                  qs.set('search', params.search);
  if (params?.is_active !== undefined) qs.set('is_active', String(params.is_active));
  if (params?.page)                    qs.set('page', String(params.page));
  return req(`/admin/customers?${qs}`);
}

export async function getAdminCustomer(id: number): Promise<{ customer: AdminCustomer; orders: Order[] }> {
  return req(`/admin/customers/${id}`);
}

export async function updateAdminCustomer(
  id: number,
  data: Partial<Pick<AdminCustomer, 'name' | 'email' | 'internal_notes' | 'is_active' | 'sms_opt_out'>>,
): Promise<{ customer: AdminCustomer }> {
  return req(`/admin/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteAdminCustomer(id: number): Promise<void> {
  await req(`/admin/customers/${id}`, { method: 'DELETE' });
}

// ── Loyalty ──────────────────────────────────────────────────────────────────

export type LoyaltyAccountAdmin = {
  id: number;
  customer_id: number;
  customer_name?: string | null;
  customer_phone: string;
  points_balance: number;
  points_held: number;
  lifetime_points: number;
  tier: string;
  updated_at: string;
};

export async function fetchLoyaltyAccounts(params?: {
  page?: number;
  search?: string;
}): Promise<{ data: LoyaltyAccountAdmin[]; meta?: { total: number } }> {
  const qs = new URLSearchParams();
  if (params?.page)   qs.set('page', String(params.page));
  if (params?.search) qs.set('search', params.search);
  return req(`/admin/loyalty/accounts?${qs}`);
}

export async function adjustLoyaltyPoints(
  customerId: number,
  delta: number,
  reason: string
): Promise<void> {
  await req(`/admin/loyalty/accounts/${customerId}/adjust`, {
    method: 'POST',
    body: JSON.stringify({ delta, reason }),
  });
}

export async function fetchLoyaltyLedger(
  customerId: number
): Promise<{ data: Array<{ id: number; delta: number; reason: string; created_at: string }> }> {
  return req(`/admin/loyalty/accounts/${customerId}/ledger`);
}

// ── Gift Cards ────────────────────────────────────────────────────────────────

export interface GiftCard {
  id: number;
  code: string;
  initial_balance: number;
  current_balance: number;
  status: 'active' | 'redeemed' | 'expired' | 'cancelled';
  expires_at: string | null;
  issued_to: { id: number; name: string } | null;
  created_at?: string;
}

export async function fetchGiftCards(params?: { page?: number }): Promise<{ data: GiftCard[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  return req(`/admin/gift-cards?${qs}`);
}

export async function issueGiftCard(data: { amount: number; customer_id?: number | null; expires_at?: string | null }): Promise<{ gift_card: GiftCard }> {
  return req('/admin/gift-cards', { method: 'POST', body: JSON.stringify(data) });
}

export async function checkGiftCardBalance(code: string): Promise<{ code: string; current_balance: number; expires_at: string | null }> {
  return req(`/gift-cards/${encodeURIComponent(code)}/balance`);
}

// ── Reviews ───────────────────────────────────────────────────────────────────

export interface Review {
  id: number;
  rating: number;
  comment: string | null;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  is_anonymous: boolean;
  author: string;
  item: { id: number; name: string } | null;
  order: { id: number; order_number: string } | null;
  created_at: string;
}

export async function fetchAdminReviews(params?: { status?: string; page?: number }): Promise<{ data: Review[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.page)   qs.set('page', String(params.page));
  return req(`/admin/reviews?${qs}`);
}

export async function moderateReview(id: number, status: 'approved' | 'rejected'): Promise<{ review: Review }> {
  return req(`/admin/reviews/${id}/moderate`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

// ── Referrals ─────────────────────────────────────────────────────────────────

export interface Referral {
  id: number;
  referrer_id: number;
  referred_id: number | null;
  code: string;
  status: string;
  reward_amount: number | null;
  reward_issued_at: string | null;
  created_at: string;
  referrer?: { id: number; name: string; phone: string };
  referred?: { id: number; name: string; phone: string } | null;
}

export async function fetchAdminReferrals(params?: {
  page?: number; status?: string;
}): Promise<{ data: Referral[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.page)   qs.set('page', String(params.page));
  if (params?.status) qs.set('status', params.status);
  return req(`/admin/referrals${qs.toString() ? '?' + qs : ''}`);
}

export async function validateReferralCode(code: string): Promise<{ valid: boolean; referrer?: { name: string; phone: string }; message?: string }> {
  return req('/referrals/validate', { method: 'POST', body: JSON.stringify({ code }) });
}

// ── Reservations ──────────────────────────────────────────────────────────────

export type AdminReservation = {
  id: number;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  date: string;
  time_slot: string;
  status: 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';
  notes: string | null;
  table: { id: number; name: string } | null;
  created_at: string;
};

export async function getReservations(params: { date?: string; status?: string; page?: number } = {}): Promise<{ data: AdminReservation[]; meta: { total: number; current_page: number; last_page: number } }> {
  const q = new URLSearchParams();
  if (params.date)   q.set('date',   params.date);
  if (params.status) q.set('status', params.status);
  if (params.page)   q.set('page',   String(params.page));
  return req(`/admin/reservations?${q}`);
}

export async function updateReservationStatus(id: number, status: string): Promise<{ reservation: AdminReservation }> {
  return req(`/admin/reservations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export interface ReservationSettings {
  max_party_size: number;
  booking_window_days: number;
  slot_duration_minutes: number;
  slots_per_interval: number;
  advance_notice_hours: number;
  auto_confirm: boolean;
  confirmation_sms: boolean;
  reminder_sms: boolean;
  reminder_hours_before: number;
}

export async function getReservationSettings(): Promise<{ settings: ReservationSettings }> {
  return req('/admin/reservations/settings');
}

export async function updateReservationSettings(data: Partial<ReservationSettings>): Promise<void> {
  await req('/admin/reservations/settings', { method: 'PATCH', body: JSON.stringify(data) });
}
