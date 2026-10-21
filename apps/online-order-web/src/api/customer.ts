// ── Customer Account — Reservations, Favourites, Pre-orders, Reviews ──────────
import { request } from './client';

// ── Opening hours ──────────────────────────────────────────────────────────────

import { ENDPOINTS } from '@shared/api';
import type { OpeningHoursStatus, Reservation, ReservationSlot } from '@shared/types';

export type { ReservationSlot };
export type CustomerReservation = Reservation;

/** One day of the weekly schedule; open and close are null on a closed day. */
export type DaySchedule = { open: string | null; close: string | null; closed?: boolean };

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

export async function createPreOrder(payload: PreOrderPayload): Promise<{ pre_order: PreOrderResult }> {
  return request<{ pre_order: PreOrderResult }>(ENDPOINTS.CUSTOMER_PRE_ORDERS, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── Reservations ───────────────────────────────────────────────────────────────

export async function fetchReservationSlots(
  date: string,
  partySize: number,
): Promise<{ slots: ReservationSlot[]; max_party_size: number; accepting: boolean }> {
  const data = await request<{ slots: ReservationSlot[]; meta?: { max_party_size?: number; accepting?: boolean } }>(
    `${ENDPOINTS.RESERVATIONS_AVAILABILITY}?date=${date}&party_size=${partySize}`,
  );
  return {
    slots: data.slots ?? [],
    max_party_size: data.meta?.max_party_size ?? 20,
    // Older servers omit — treat as accepting.
    accepting: data.meta?.accepting !== false,
  };
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

export async function getMyReservations(): Promise<{ data: CustomerReservation[] }> {
  return request('/reservations');
}

export async function cancelMyReservation(id: number): Promise<void> {
  await request<void>(`/reservations/${id}`, { method: 'DELETE' });
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

/** Raw item shape from GET /customer/favorites (category may be nested). */
type ApiFavouriteItem = {
  id: number;
  name: string;
  base_price: number | string;
  image_url?: string | null;
  category?: string | { id?: number; name?: string } | null;
  is_available?: boolean;
  is_active?: boolean;
};

/** Normalize API favourites envelope (`favorites` or legacy `data`) for the UI. */
export function normalizeFavouritesResponse(res: {
  favorites?: ApiFavouriteItem[];
  data?: ApiFavouriteItem[];
}): { data: FavouriteItem[] } {
  const raw = res.favorites ?? res.data ?? [];
  return {
    data: raw.map((item) => {
      const cat = item.category;
      return {
        id: item.id,
        name: item.name,
        base_price: Number(item.base_price),
        image_url: item.image_url ?? null,
        category: typeof cat === 'string' ? cat : (cat?.name ?? null),
        is_available: item.is_available ?? item.is_active ?? true,
      };
    }),
  };
}

export async function getMyFavourites(): Promise<{ data: FavouriteItem[] }> {
  // Backend returns `{ favorites: Item[] }` (see FavoritesController + CustomerTokenScopeTest).
  const res = await request<{ favorites?: ApiFavouriteItem[]; data?: ApiFavouriteItem[] }>(
    '/customer/favorites',
  );
  return normalizeFavouritesResponse(res);
}

export async function toggleFavourite(itemId: number): Promise<{ is_favourite: boolean }> {
  // Backend returns `{ favorited: boolean, item_id }` — map to the UI name.
  const res = await request<{ favorited?: boolean; is_favourite?: boolean }>(
    `/customer/favorites/${itemId}/toggle`,
    { method: 'POST' },
  );
  return { is_favourite: res.is_favourite ?? res.favorited ?? false };
}

// ── Tell me when it's back / on sale (iruali import plan, feature 8) ──────────

/** The dishes this customer has asked to hear about. */
export async function getItemAlerts(): Promise<{ item_ids: number[] }> {
  return request('/customer/item-alerts');
}

export async function setItemAlert(itemId: number, on: boolean): Promise<{ waiting: boolean }> {
  return request(`/customer/items/${itemId}/alert`, { method: on ? 'POST' : 'DELETE' });
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

export async function getMyPreOrders(): Promise<{ data: CustomerPreOrder[] }> {
  return request('/customer/pre-orders');
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
  payload: { order_id: number; rating: number; comment: string; is_anonymous: boolean; photos?: File[] },
): Promise<void> {
  const { photos = [], ...fields } = payload;
  if (photos.length === 0) {
    await request<void>(ENDPOINTS.REVIEWS, { method: 'POST', body: JSON.stringify(fields) });
    return;
  }
  // Up to three photos (iruali import plan, feature 6).
  const body = new FormData();
  body.append('order_id', String(fields.order_id));
  body.append('rating', String(fields.rating));
  body.append('comment', fields.comment);
  body.append('is_anonymous', fields.is_anonymous ? '1' : '0');
  photos.slice(0, 3).forEach((file) => body.append('photos[]', file));
  await request<void>(ENDPOINTS.REVIEWS, { method: 'POST', body });
}

/** "Helpful" on someone else's review, once (feature 6). */
export async function markReviewHelpful(reviewId: number): Promise<{ helpful_count: number; voted: boolean }> {
  return request(`/reviews/${reviewId}/helpful`, { method: 'POST' });
}

export async function getMyReviews(
  params: { page?: number; per_page?: number } = {},
): Promise<{
  data: CustomerReview[];
  meta?: { current_page: number; last_page: number; per_page: number; total: number };
}> {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  q.set('per_page', String(params.per_page ?? 20));
  return request(`/customer/reviews?${q.toString()}`);
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
  /** The account paid from the wallet every night (phase 4, 2026-10-21). */
  settle_from_wallet?: boolean;
  /** An online order may go on the account (the owner's switch, and the account can take it). */
  online_orders?: boolean;
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

export async function getCustomerCredit(): Promise<{
  credit: (CustomerCreditSummary & { open_invoices: CustomerCreditInvoice[] }) | null;
}> {
  return request('/customer/credit');
}

export async function updateCustomerCreditPreferences(
  data: { credit_reminder_sms?: boolean; credit_settle_from_wallet?: boolean },
): Promise<{
  credit: CustomerCreditSummary & { open_invoices: CustomerCreditInvoice[] };
}> {
  return request('/customer/credit/preferences', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export type CustomerDepositSummary = {
  balance_mvr: number;
  status: 'active' | 'frozen' | 'closed';
  can_use: boolean;
  /** Part of an unpaid online order is on hold (owner, 2026-10-21). */
  held_mvr?: number;
  /** What may be spent now: the balance less what is on hold. */
  available_mvr?: number;
  /** The customer's own choice: the wallet first at checkout. */
  wallet_first?: boolean;
  /** The family wallet (phase 4): whose wallet this is when it is not their own. */
  shared_from?: string | null;
  /** Who shares their wallet with this customer, when someone does. */
  shares_wallet_of?: string | null;
  /** Who this customer shares their wallet with. */
  shared_with?: Array<{ id: number; name: string; phone: string }>;
};

/** The family wallet (phase 4): who shares it, and whose wallet the customer may spend. */
export type WalletMembersState = {
  members: Array<{ id: number; name: string; phone: string }>;
  max: number;
  shares_wallet_of: { name: string; balance_mvr: number; active: boolean } | null;
};

export async function getWalletMembers(): Promise<WalletMembersState> {
  return request('/customer/wallet/members');
}

export async function addWalletMember(phone: string): Promise<WalletMembersState & { message: string }> {
  return request('/customer/wallet/members', { method: 'POST', body: JSON.stringify({ phone }) });
}

export async function removeWalletMember(memberId: number): Promise<WalletMembersState> {
  return request(`/customer/wallet/members/${memberId}`, { method: 'DELETE' });
}

export async function leaveSharedWallet(): Promise<WalletMembersState> {
  return request('/customer/wallet/members/leave', { method: 'DELETE' });
}

export type CustomerDepositTransaction = {
  id: number;
  label: string;
  type: string;
  amount_mvr: number;
  direction: 'credit' | 'debit';
  balance_after_mvr: number;
  order_id?: number | null;
  created_at?: string | null;
};

export async function getCustomerDeposit(): Promise<{ deposit: CustomerDepositSummary | null }> {
  return request('/customer/deposit');
}

export async function getCustomerDepositLedger(): Promise<{
  deposit: CustomerDepositSummary | null;
  transactions: CustomerDepositTransaction[];
}> {
  return request('/customer/deposit/ledger');
}

// ── Wallet (iruali import plan, feature 12) ─────────────────────────────────

/** A gift card's whole balance into the wallet; the card is used up. */
export async function addGiftCardToWallet(code: string): Promise<{ added_laar: number; balance_laar: number; message: string }> {
  return request('/customer/wallet/gift-card', { method: 'POST', body: JSON.stringify({ code }) });
}

/** Pay what an order still owes from the wallet; refused unless the wallet covers all of it. */
export async function payOrderFromWallet(orderId: number): Promise<{ order: { id: number; status: string; payment_status: string }; balance_laar: number }> {
  return request(`/customer/orders/${orderId}/pay-wallet`, { method: 'POST' });
}

/**
 * The wallet does not cover the order: put what it has on hold and pay the
 * rest by card (owner, 2026-10-21). Nothing leaves the wallet until the bank
 * confirms the card.
 */
export async function holdWalletForOrder(orderId: number): Promise<{ held_laar: number; remaining_laar: number }> {
  return request(`/customer/orders/${orderId}/hold-wallet`, { method: 'POST' });
}

/** The wallet was unticked before paying by card: a hold from an earlier tap goes. */
export async function releaseWalletHold(orderId: number): Promise<{ released: number }> {
  return request(`/customer/orders/${orderId}/hold-wallet`, { method: 'DELETE' });
}

/** An online order on the credit account (phase 4, 2026-10-21): charged and sent to the kitchen at once. */
export async function payOrderOnCredit(orderId: number): Promise<{ order: { id: number; status: string; payment_status: string }; credit: CustomerCreditSummary }> {
  return request(`/customer/orders/${orderId}/pay-credit`, { method: 'POST' });
}

// ── The credit account paid online as a whole (owner, 2026-10-21) ────────────

export type CreditStatementInvoice = {
  id: number;
  invoice_number: string;
  order_id: number | null;
  issue_date: string | null;
  due_date: string | null;
  overdue: boolean;
  days_overdue: number;
  total_mvr: number;
  balance_due_mvr: number;
  view_url: string | null;
};

export type CreditStatement = {
  enabled: boolean;
  status: string;
  balance_mvr: number;
  available_mvr: number;
  limit_mvr: number;
  overdue_mvr: number;
  next_due_date: string | null;
  payment_terms_days: number;
  invoices: CreditStatementInvoice[];
  /** The public statement page, printable, with Pay online. */
  statement_url: string;
  can_pay_online: boolean;
};

export type CreditPaymentStatus = {
  token: string;
  number: string;
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  amount_mvr: number;
  balance_after_mvr: number | null;
  paid_at: string | null;
  expires_at: string | null;
};

export async function getCreditStatement(): Promise<{ statement: CreditStatement | null }> {
  return request('/customer/credit/statement');
}

/** Pay the whole balance by card, or an amount of it; the reply carries the bank's page. */
export async function startCreditPayment(amountMvr?: number): Promise<{ credit_payment: CreditPaymentStatus; payment_url: string }> {
  return request('/customer/credit/pay', {
    method: 'POST',
    body: JSON.stringify(amountMvr !== undefined ? { amount_laar: Math.round(amountMvr * 100) } : {}),
  });
}

/** How a credit payment went; while pending the server asks the bank. */
export async function getCreditPayment(token: string): Promise<{ credit_payment: CreditPaymentStatus; balance_mvr: number }> {
  return request(`/customer/credit/payments/${encodeURIComponent(token)}`);
}

// ── Money into the wallet by card (owner, 2026-10-21) ───────────────────────

/** What this customer may add by card, and the amounts to offer (WalletTopUpRules). */
export type WalletTopUpRules = {
  enabled: boolean;
  can_top_up: boolean;
  reason: 'off' | 'no_phone' | 'verify_phone' | 'on_hold' | 'closed' | null;
  message: string | null;
  presets_mvr: number[];
  min_mvr: number;
  max_mvr: number | null;
  daily_cap_mvr: number | null;
  used_today_mvr: number;
  max_balance_mvr: number | null;
  balance_mvr: number;
  /** A bonus on top-ups (phase 4): this many percent extra on top-ups of at least bonus_min_mvr; 0 is off. */
  bonus_percent?: number;
  bonus_min_mvr?: number;
};

export type WalletTopUp = {
  token: string;
  number: string;
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  amount_mvr: number | null;
  amount_fixed: boolean;
  balance_after_mvr: number | null;
  paid_at: string | null;
  expires_at: string | null;
  /** The top-up's own page: the receipt once paid. */
  url: string;
};

export async function getWalletTopUpRules(): Promise<{ rules: WalletTopUpRules }> {
  return request('/customer/wallet/top-ups/rules');
}

/** Start a card top-up; the reply carries the bank's page to go to. */
export async function startWalletTopUp(amountMvr: number): Promise<{ top_up: WalletTopUp; payment_url: string }> {
  return request('/customer/wallet/top-ups', { method: 'POST', body: JSON.stringify({ amount_laar: Math.round(amountMvr * 100) }) });
}

/** How a top-up went; while pending the server asks the bank. */
export async function getWalletTopUp(token: string): Promise<{ top_up: WalletTopUp; balance_mvr: number }> {
  return request(`/customer/wallet/top-ups/${encodeURIComponent(token)}`);
}

/** Ask an owner to erase this account's personal data. Orders and amounts stay. */
export async function requestAccountErasure(): Promise<{ message: string }> {
  return request('/customer/erasure-request', { method: 'POST' });
}
