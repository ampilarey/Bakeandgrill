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
  credit_enabled?: boolean;
  credit_status?: 'active' | 'on_hold' | 'blocked';
  credit_limit_laar?: number;
  credit_balance_laar?: number;
  badges?: string[];
}

export type CustomerCreditInfo = {
  customer_id: number;
  enabled: boolean;
  status: 'active' | 'on_hold' | 'blocked';
  limit_laar: number;
  balance_laar: number;
  available_laar: number;
  can_charge: boolean;
  credit_notes?: string | null;
  approved_by?: number | null;
  approved_at?: string | null;
  approved_by_name?: string | null;
  payment_terms_days: number;
  reminder_sms_enabled: boolean;
  next_payment_due_date?: string | null;
  limit_mvr: number;
  balance_mvr: number;
  available_mvr: number;
};

export type CustomerCreditLedgerRow = {
  id: number;
  type: string;
  amount_laar: number;
  amount_mvr: number;
  balance_after_laar: number;
  balance_after_mvr: number;
  order_id?: number | null;
  invoice_id?: number | null;
  method?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

export type CustomerCreditInvoice = {
  id: number;
  invoice_number: string;
  order_id?: number | null;
  total_laar: number;
  amount_paid_laar: number;
  balance_due_laar: number;
  issue_date?: string | null;
  due_date?: string | null;
  status: string;
};

export const CREDIT_PAYMENT_TERMS_OPTIONS = [7, 14, 30, 45, 60] as const;

export async function fetchCustomerCredit(customerId: number): Promise<{
  credit: CustomerCreditInfo;
  ledger: CustomerCreditLedgerRow[];
  open_invoices: CustomerCreditInvoice[];
}> {
  return req(`/admin/customers/${customerId}/credit`);
}

export async function updateCustomerCredit(
  customerId: number,
  data: {
    action: 'approve' | 'disable' | 'update_limit' | 'set_status' | 'update_terms' | 'set_reminder_sms';
    credit_limit_mvr?: number;
    credit_notes?: string;
    credit_status?: 'active' | 'on_hold' | 'blocked';
    credit_payment_terms_days?: number;
    credit_reminder_sms?: boolean;
    override_limit?: boolean;
  },
): Promise<{ customer: CustomerCreditInfo }> {
  return req(`/admin/customers/${customerId}/credit`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function recordCustomerCreditRepayment(
  customerId: number,
  data: {
    amount_mvr: number;
    method: 'cash' | 'card' | 'bank_transfer';
    reference?: string;
    notes?: string;
    invoice_ids?: number[];
  },
): Promise<{ credit: CustomerCreditInfo; ledger: CustomerCreditLedgerRow }> {
  return req(`/admin/customers/${customerId}/credit/repayments`, { method: 'POST', body: JSON.stringify(data) });
}

export async function fetchAdminCustomers(params?: {
  search?: string;
  is_active?: boolean;
  segment?: string;
  page?: number;
}): Promise<{ data: AdminCustomer[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.search)                  qs.set('search', params.search);
  if (params?.is_active !== undefined) qs.set('is_active', String(params.is_active));
  if (params?.segment)                 qs.set('segment', params.segment);
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

export async function changeAdminCustomerPhone(
  id: number,
  phone: string,
): Promise<{ customer: AdminCustomer; revoked_tokens: number; message: string }> {
  return req(`/admin/customers/${id}/phone`, { method: 'PATCH', body: JSON.stringify({ phone }) });
}

export async function mergeAdminCustomers(
  primaryId: number,
  sourceCustomerIds: number[],
): Promise<{ customer: AdminCustomer; merged: Array<{ id: number; phone: string }>; message: string }> {
  return req(`/admin/customers/${primaryId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ source_customer_ids: sourceCustomerIds }),
  });
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

export type LoyaltySettings = {
  enabled: boolean;
  earn_rate_per_mvr: number;
  redeem_rate_points_per_mvr: number;
  min_redeem_points: number;
  max_redeem_points: number;
  max_redeem_percent: number;
  hold_ttl_minutes: number;
  tiers_enabled: boolean;
  points_expiry_days: number;
  earn_on_delivery_fee: boolean;
  program_starts_at: string | null;
  program_ends_at: string | null;
  customer_message: string;
};

export type LoyaltyTierRow = {
  id: number;
  name: string;
  slug: string;
  min_lifetime_points: number;
  earn_multiplier: number;
  sort_order: number;
};

export async function fetchLoyaltySettings(): Promise<{ settings: LoyaltySettings; tiers: LoyaltyTierRow[] }> {
  return req('/admin/loyalty/settings');
}

export async function updateLoyaltySettings(data: Partial<LoyaltySettings>): Promise<{ settings: LoyaltySettings; message: string }> {
  return req('/admin/loyalty/settings', { method: 'PUT', body: JSON.stringify(data) });
}

export async function updateLoyaltyTiers(tiers: LoyaltyTierRow[]): Promise<{ tiers: LoyaltyTierRow[]; message: string }> {
  return req('/admin/loyalty/tiers', { method: 'PUT', body: JSON.stringify({ tiers }) });
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

export async function fetchGiftCards(params?: { page?: number; status?: string }): Promise<{ data: GiftCard[]; meta: { current_page: number; last_page: number; total: number; active_count?: number; active_balance?: number } }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.status) qs.set('status', params.status);
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
//
// Backend (`ReferralController::adminIndex`) returns one row per
// **referral code**, not per redemption event:
//   { id, code, customer, uses_count, max_uses,
//     referrer_reward_mvr, referee_discount_mvr, is_active }
// The old admin page was modelled on "referral events" (a redemption per row)
// which never matched reality. The type below now mirrors the backend shape
// exactly and the page renders accordingly.

export interface ReferralCode {
  id: number;
  code: string;
  customer: { id: number; name: string } | null;
  uses_count: number;
  max_uses: number | null;
  referrer_reward_mvr: number;
  referee_discount_mvr: number;
  is_active: boolean;
}

export async function fetchAdminReferrals(params?: {
  page?: number;
}): Promise<{ data: ReferralCode[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  return req(`/admin/referrals${qs.toString() ? '?' + qs : ''}`);
}

export async function validateReferralCode(
  code: string,
): Promise<{ valid: boolean; referee_discount_mvr?: number; message?: string }> {
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
