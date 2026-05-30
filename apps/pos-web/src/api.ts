import { createApiClient } from "@shared/api";
import type {
  Category,
  MenuItem as Item,
  RestaurantTable,
  SalesSummary,
  StaffLoginResponse,
  StaffUser,
} from "@shared/types";

export type { SalesSummary };

function resolvePosApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const defaultForMode = import.meta.env.PROD
    ? "/api"
    : "http://localhost:8000/api";
  let base = envUrl ?? defaultForMode;

  // Deployed sites must not call a dev machine URL (often baked in if the bundle
  // was built with MODE=development or VITE_API_BASE_URL=http://localhost:8000/api).
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    const pageIsLocal = h === "localhost" || h === "127.0.0.1";
    const baseLooksLocal =
      base.includes("localhost") || base.includes("127.0.0.1");
    if (!pageIsLocal && baseLooksLocal) {
      base = "/api";
    }
  }

  return base;
}

const API_BASE_URL = resolvePosApiBaseUrl();

/** Shared base URL for fetch calls outside the authenticated api client. */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.warn("[CONFIG] VITE_API_BASE_URL is not set — falling back to same-origin /api");
}

// Module-level token — initialised from localStorage so page refresh
// doesn't silently log out the POS. Cleared on explicit logout.
//
// SECURITY DEBT (H9): storing the Sanctum token in localStorage exposes
// it to XSS exfiltration and to anyone with physical access to the iPad
// (e.g. via Safari → Develop → Storage). Production-grade fix is to move
// staff auth onto HttpOnly cookies with Sanctum's stateful flow, which
// requires:
//   - Sanctum SPA mode + sanctum/csrf-cookie endpoint
//   - SANCTUM_STATEFUL_DOMAINS env on the API
//   - withCredentials: true on every fetch
//   - Backend CORS + same-site cookie config
// That migration touches every app (pos, admin, online-order) plus the
// kiosk receipt flow — tracked as a separate effort. For now we mitigate
// with strict CSP on the kiosk Safari profile (no external scripts) and
// short-lived tokens (Sanctum default).
let _token: string | null = localStorage.getItem('pos_token');
export function setAuthToken(t: string | null): void {
  _token = t;
}

const { request: _coreRequest } = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => _token,
});

// Wraps every API call: injects optional X-Device-Identifier for audit metadata.
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const deviceId = localStorage.getItem('pos_device_id');
  const extraHeaders: HeadersInit = deviceId
    ? { 'X-Device-Identifier': deviceId }
    : {};
  const merged: RequestInit = {
    ...options,
    headers: { ...extraHeaders, ...(options?.headers ?? {}) },
  };
  try {
    return await _coreRequest<T>(path, merged);
  } catch (e) {
    // Auth expiry: bubble a single global event the App listens for.
    // Without this, individual call sites silently log a 401 and the
    // cashier wonders why nothing works. ApiRequestError carries the
    // HTTP status from the shared client.
    const status = (e as { status?: number })?.status;
    if (status === 401) {
      // Clear the cached token so reauth flow doesn't loop with a
      // stale value still attached to outgoing requests.
      _token = null;
      localStorage.removeItem('pos_token');
      window.dispatchEvent(new Event('auth_expired'));
    }
    throw e;
  }
}

export async function fetchCategories(): Promise<Category[]> {
  const data = await request<{ categories?: Category[]; data?: Category[] }>(
    "/categories?with_items=0",
  );
  return data.categories ?? data.data ?? [];
}

export type PosBootstrapShift = {
  id: number;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  variance: number | null;
};

export type PosSmsNotifications = {
  send_bill: boolean;
  send_pay_link: boolean;
  receipt_resend: boolean;
};

export const DEFAULT_POS_SMS_NOTIFICATIONS: PosSmsNotifications = {
  send_bill: true,
  send_pay_link: true,
  receipt_resend: true,
};

function normalizePosSmsNotifications(raw: unknown): PosSmsNotifications {
  if (!raw || typeof raw !== "object") return DEFAULT_POS_SMS_NOTIFICATIONS;
  const o = raw as Record<string, unknown>;
  return {
    send_bill: o.send_bill !== false,
    send_pay_link: o.send_pay_link !== false,
    receipt_resend: o.receipt_resend !== false,
  };
}

/** Login bootstrap — menu + current shift in one request. */
export async function fetchPosBootstrap(channel?: PosSalesChannel): Promise<{
  categories: Category[];
  items: Item[];
  shift: PosBootstrapShift | null;
  smsNotifications: PosSmsNotifications;
}> {
  const params = new URLSearchParams();
  if (channel) params.set("channel", channel);
  const data = await request<{
    categories: Category[];
    items: Item[];
    shift: PosBootstrapShift | null;
    sms_notifications?: PosSmsNotifications;
  }>(`/pos/bootstrap?${params.toString()}`);
  return {
    categories: data.categories ?? [],
    items: data.items ?? [],
    shift: data.shift ?? null,
    smsNotifications: normalizePosSmsNotifications(data.sms_notifications),
  };
}

/** Single round-trip menu load for the POS register (channel changes). */
export async function fetchPosMenu(channel?: PosSalesChannel): Promise<{
  categories: Category[];
  items: Item[];
}> {
  const params = new URLSearchParams();
  if (channel) params.set("channel", channel);
  const data = await request<{ categories: Category[]; items: Item[] }>(
    `/pos/menu?${params.toString()}`,
  );
  return {
    categories: data.categories ?? [],
    items: data.items ?? [],
  };
}

/**
 * Fetch the public POS quick-notes chip library — owner-curated list
 * of one-tap kitchen instructions like "No salt" / "Extra spicy".
 * Returns an empty array if the setting is missing, malformed, or
 * the request fails so the rest of the POS still boots cleanly.
 *
 * The chip list lives on the `pos_quick_notes` site setting (see
 * 2026_05_19_000001 migration). Owner edits the JSON in
 * Admin → Settings → Website Settings.
 */
export async function fetchPublicSiteSettings(): Promise<Record<string, string | null>> {
  try {
    const data = await request<{ settings: Record<string, string | null> }>(
      "/site-settings/public",
    );
    return data.settings ?? {};
  } catch {
    return {};
  }
}

export type GstBootstrap = {
  default_tax_rate_bp: number;
  tax_rate_percent: number;
  tax_inclusive: boolean;
  gst_registered: boolean;
  currency: string;
  sector?: string;
};

let _gstBootstrapCache: GstBootstrap | null = null;

/** Authoritative GST rate for cart preview — server still calculates on order create. */
export async function fetchGstBootstrap(): Promise<GstBootstrap> {
  if (_gstBootstrapCache) return _gstBootstrapCache;
  try {
    const data = await request<GstBootstrap>("/gst/bootstrap");
    _gstBootstrapCache = data;
    return data;
  } catch {
    return {
      default_tax_rate_bp: 800,
      tax_rate_percent: 8,
      tax_inclusive: false,
      gst_registered: false,
      currency: "MVR",
    };
  }
}

/** Server-side delivery fee preview — matches DeliveryFeeCalculator. */
export async function previewDeliveryFeeMvr(
  island: string,
  subtotalLaar: number,
): Promise<number> {
  try {
    const params = new URLSearchParams({
      island: island.trim() || "Male",
      subtotal_laar: String(Math.max(0, subtotalLaar)),
    });
    const data = await request<{ fee_mvr: number }>(
      `/ordering/delivery-fee-preview?${params}`,
    );
    return Number.isFinite(data.fee_mvr) ? data.fee_mvr : 0;
  } catch {
    return 0;
  }
}

export async function fetchPosQuickNotes(): Promise<string[]> {
  try {
    const settings = await fetchPublicSiteSettings();
    const raw = settings?.pos_quick_notes;
    if (!raw) return [];
    // The site_settings table stores everything as a string; JSON
    // settings are decoded on read here so the rest of the POS can
    // treat the result as a normal array of strings.
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((n): n is string => typeof n === "string")
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
  } catch {
    // Setting hasn't been seeded yet, server unreachable, or JSON is
    // bad. Don't surface — the cashier just doesn't see the picker.
    return [];
  }
}

/**
 * POS sales-channel codes — match the values stored in
 * `item_channel_availability.channel` on the backend. The cashier's
 * selected order type maps to one of these so the menu only shows items
 * the admin has flagged as orderable for that channel:
 *
 *   - dine_in       : in-restaurant ticket
 *   - takeaway      : POS register counter takeaway
 *   - online_pickup : item is also orderable online (POS sees it too)
 *   - delivery      : delivery channel (rarely used at POS)
 *
 * Admins control this per-item in MenuPage → "Available on" toggles, so
 * an item marked "Dine-in only" disappears from the POS menu when the
 * cashier flips the order type to Takeaway. The whole machinery already
 * existed in KitchenMenuResolver — the POS was just defaulting to
 * `online_pickup` regardless of what the cashier was actually ringing,
 * which is why the toggles felt invisible at the register.
 */
export type PosSalesChannel = "dine_in" | "takeaway" | "online_pickup" | "delivery";

export async function fetchItems(channel?: PosSalesChannel): Promise<Item[]> {
  // ItemController caps staff requests at `min(100, per_page)` and
  // defaults `per_page` to 25 when the staff token is present. We
  // used to request `per_page=100` and stop — which silently
  // truncated menus larger than 100 items (Bug-026). Now we PAGE
  // through every available page so a 250-item menu is fully
  // loaded. Hard cap at 10 pages (1000 items) as a sanity guard so
  // a runaway server response can't lock the iPad.
  const MAX_PAGES = 10;

  const fetchPage = async (page: number) => {
    const params = new URLSearchParams();
    if (channel) params.set("channel", channel);
    params.set("view", "pos");
    params.set("per_page", "100");
    params.set("page", String(page));
    const res = await request<{
      data: Item[];
      meta?: { current_page?: number; last_page?: number };
      last_page?: number;
      current_page?: number;
    }>(`/items?${params.toString()}`);
    const batch = res.data ?? [];
    const lastPage = res.meta?.last_page ?? res.last_page ?? page;
    return { batch, lastPage };
  };

  const first = await fetchPage(1);
  const out: Item[] = [...first.batch];
  const lastPage = Math.min(first.lastPage, MAX_PAGES);
  if (lastPage > 1) {
    const rest = await Promise.all(
      Array.from({ length: lastPage - 1 }, (_, i) => fetchPage(i + 2)),
    );
    for (const page of rest) out.push(...page.batch);
  }
  return out;
}

export async function lookupBarcode(barcode: string): Promise<Item | null> {
  const data = await request<{ item: Item }>(`/items/barcode/${barcode}`);
  return data.item ?? null;
}

export async function staffLogin(
  username: string,
  pin: string,
  deviceIdentifier: string
): Promise<StaffLoginResponse> {
  return request<StaffLoginResponse>("/auth/staff/pin-login", {
    method: "POST",
    body: JSON.stringify({ username, pin, device_identifier: deviceIdentifier }),
  });
}

/**
 * Bug-052: cheap "is my token still good?" ping. Used by the POS
 * shell on visibilitychange to proactively boot the cashier to
 * the lock screen if the Sanctum token expired while the tab was
 * backgrounded — instead of letting them ring up a ticket and
 * fail at charge time. Resolves silently on success; the 401
 * branch in `request()` already dispatches `auth_expired` which
 * App.tsx listens for.
 */
export async function fetchMe(): Promise<StaffUser> {
  const res = await request<{ user: StaffUser }>("/auth/me");
  return res.user;
}

export async function updateMyPreferences(data: {
  pos_idle_lock_minutes: number;
}): Promise<{ message: string; user: StaffUser }> {
  return request("/auth/me/preferences", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function pingAuth(): Promise<void> {
  await fetchMe();
}

export async function selfRegisterDevice(identifier: string, name: string): Promise<{ status: string; device?: { id: number } }> {
  return request<{ status: string; device?: { id: number } }>("/devices/self-register", {
    method: "POST",
    body: JSON.stringify({ identifier, name, type: "pos" }),
  });
}

export async function selfDeviceStatus(identifier: string): Promise<{ status: string; is_active?: boolean; id?: number }> {
  return request<{ status: string; is_active?: boolean; id?: number }>(`/devices/self-status?identifier=${encodeURIComponent(identifier)}`);
}

export type PosCustomer = {
  id: number;
  name: string | null;
  phone: string | null;
  email?: string | null;
  loyalty_points?: number;
  tier?: string | null;
  sms_opt_out?: boolean;
  last_order_at?: string | null;
  orders_count?: number;
};

export async function createOrder(payload: {
  type: string;
  print?: boolean;
  device_identifier?: string;
  restaurant_table_id?: number | null;
  customer_id?: number | null;
  discount_amount?: number;
  ticket_name?: string;
  ticket_note?: string;
  items: Array<{
    item_id?: number | null;
    name: string;
    quantity: number;
    variant_id?: number | null;
    modifiers?: Array<{
      modifier_id?: number | null;
      name: string;
      price: number;
    }>;
    notes?: string;
  }>;
}): Promise<{ order: { id: number; total: number } }> {
  return request("/orders", { method: "POST", body: JSON.stringify(payload) });
}

export async function createDeliveryOrder(payload: {
  print?: boolean;
  device_identifier?: string;
  customer_id?: number | null;
  discount_amount?: number;
  ticket_name?: string;
  ticket_note?: string;
  delivery_address_line1: string;
  delivery_address_line2?: string;
  delivery_island: string;
  delivery_contact_name: string;
  delivery_contact_phone: string;
  delivery_notes?: string;
  delivery_location_link?: string;
  items: Array<{
    item_id?: number | null;
    name: string;
    quantity: number;
    variant_id?: number | null;
    modifiers?: Array<{
      modifier_id?: number | null;
      name: string;
      price: number;
    }>;
    notes?: string;
  }>;
}): Promise<{ order: { id: number; total: number; delivery_fee?: number } }> {
  return request("/orders/delivery", { method: "POST", body: JSON.stringify(payload) });
}

export async function searchCustomers(q: string): Promise<{ data: PosCustomer[] }> {
  return request<{ data: PosCustomer[] }>(`/customers/search?q=${encodeURIComponent(q)}`);
}

export type PosCustomerAddress = {
  id: number;
  label: string | null;
  address_line1: string;
  address_line2: string | null;
  island: string;
  contact_name: string;
  contact_phone: string;
  notes: string | null;
  location_link: string | null;
  is_default: boolean;
};

export async function fetchCustomerAddresses(customerId: number): Promise<{ addresses: PosCustomerAddress[] }> {
  return request<{ addresses: PosCustomerAddress[] }>(`/customers/${customerId}/addresses`);
}

/**
 * Pull the most recent customers — defaults to 50, ordered by
 * COALESCE(last_order_at, created_at) DESC so brand-new customers
 * (no order yet) still appear. Used by the POS Customer Picker as a
 * "tap a regular" shortcut when the cashier opens the picker without
 * typing anything yet. Backed by the same /customers/search endpoint
 * with an empty q. The cashier types ≥2 chars to search the full
 * database; the `total` lets us show "Showing X of N — type to search
 * all".
 */
export async function fetchRecentCustomers(
  limit = 50,
): Promise<{ data: PosCustomer[]; total: number; limit: number }> {
  return request<{ data: PosCustomer[]; total: number; limit: number }>(
    `/customers/search?q=&limit=${limit}`,
  );
}

export async function quickCreateCustomer(
  payload: { phone: string; name?: string },
): Promise<{ customer: PosCustomer; created: boolean }> {
  return request(`/customers/quick`, { method: "POST", body: JSON.stringify(payload) });
}

/**
 * Update a customer's name/email straight from the POS chip — used to
 * add a name on a customer who was registered phone-only. Phone is
 * intentionally NOT settable here (it's the matching key for
 * quick-attach + SMS; a fix has to go through Admin → Customers).
 */
export async function updateCustomerFromPos(
  id: number,
  patch: { name?: string | null; email?: string | null },
): Promise<{ customer: PosCustomer }> {
  return request(`/customers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// ── Customer dashboard / rewards (POS-only) ──────────────────────────────
//
// All of the endpoints below are NEW POS-scoped twins that live alongside
// the customer-facing ones — they let a cashier inspect a customer's
// loyalty/lifetime stats and apply promo codes / loyalty redemptions /
// gift cards on behalf of the customer attached to a ticket. The online
// ordering app is untouched.

export type PosCustomerSummary = {
  customer: PosCustomer & {
    tier?: string | null;
    internal_notes?: string | null;
    created_at?: string | null;
  };
  loyalty: {
    points_balance: number;
    points_held: number;
    available_points: number;
    lifetime_points: number;
    tier?: string | null;
  };
  lifetime: {
    orders_count: number;
    total_spent: number;
    first_paid_at: string | null;
    last_paid_at: string | null;
  };
  recent_orders: Array<{
    id: number;
    order_number: string;
    type: string;
    status: string;
    total: number;
    paid_at: string | null;
  }>;
  credit?: {
    enabled: boolean;
    status: 'active' | 'on_hold' | 'blocked';
    limit_laar: number;
    balance_laar: number;
    available_laar: number;
    can_charge: boolean;
  };
};

export async function fetchCustomerSummary(customerId: number): Promise<PosCustomerSummary> {
  return request<PosCustomerSummary>(`/customers/${customerId}/pos-summary`);
}

/** Validate a promo code BEFORE ringing the order. Returns the estimated
 *  discount when an order_id is provided, otherwise just confirms validity
 *  so the cart can show "code is valid — discount will apply at checkout". */
export async function validatePromoCode(
  code: string,
  orderId?: number,
): Promise<{
  valid: boolean;
  message?: string;
  discount_laar?: number;
  discount_mvr?: string;
  promotion?: { name: string; type: string; discount_value: number; scope: string };
}> {
  return request("/promotions/validate", {
    method: "POST",
    body: JSON.stringify({ code, ...(orderId != null ? { order_id: orderId } : {}) }),
  });
}

/** Apply a previously-validated promo code to an existing order. Server
 *  enforces the staff `promotions.discounts` permission. */
export async function applyPromoToOrder(
  orderId: number,
  code: string,
): Promise<{ message: string; discount_laar: number; discount_mvr: string; promotion_id: number }> {
  return request(`/orders/${orderId}/apply-promo`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

/** Preview how much a loyalty redemption would discount the order without
 *  actually placing the hold. Server caps `points` at the customer's
 *  current available balance. */
export async function previewLoyaltyRedeem(
  orderId: number,
  points: number,
): Promise<{
  points: number;
  discount_laar: number;
  discount_mvr: string;
  available_points: number;
}> {
  return request("/pos/loyalty/preview", {
    method: "POST",
    body: JSON.stringify({ order_id: orderId, points }),
  });
}

/** Place / refresh a loyalty hold on the order (debits available_points
 *  once consumed on payment). Returns the discount actually applied. */
export async function holdLoyaltyForOrder(
  orderId: number,
  points: number,
): Promise<{
  hold: { points_held: number; discount_laar: number; discount_mvr: string; expires_at: string };
  order: { id: number; total: number; subtotal: number; tax_amount: number; loyalty_discount_laar: number };
}> {
  return request("/pos/loyalty/hold", {
    method: "POST",
    body: JSON.stringify({ order_id: orderId, points }),
  });
}

export async function releaseLoyaltyHold(orderId: number): Promise<{ message: string }> {
  return request(`/pos/loyalty/hold/${orderId}`, { method: "DELETE" });
}

/** Lightweight balance check — public route, no auth needed. The POS
 *  uses this before applying so the cashier can see "MVR 250 on this
 *  card" before they commit it as a tender. */
export async function checkGiftCardBalance(code: string): Promise<{
  code: string;
  current_balance: number;
  expires_at: string | null;
}> {
  return request(`/gift-cards/${encodeURIComponent(code)}/balance`);
}

/** Apply a gift card to a POS order. The server sets gift_card_code +
 *  gift_card_discount_laar on the order row and recalculates totals; the
 *  actual balance debit happens at payment time via PaymentService. */
export async function applyGiftCardToOrder(
  orderId: number,
  code: string,
): Promise<{
  discount_laar: number;
  discount_mvr: string;
  card_balance: number;
  order: { id: number; total: number; subtotal: number; tax_amount: number; gift_card_discount_laar: number };
}> {
  return request(`/pos/orders/${orderId}/gift-card`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function removeGiftCardFromOrder(orderId: number): Promise<{ message: string }> {
  return request(`/pos/orders/${orderId}/gift-card`, { method: "DELETE" });
}

/** Minimal "incoming online order" record used by the new-order toast.
 *  Only the fields the cashier actually needs in the corner toast — full
 *  order detail is fetched on demand when they click through. */
export type IncomingOnlineOrder = {
  id: number;
  order_number: string;
  type: string;
  status: string;
  total: number;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
};

/**
 * Fetch recent online orders (pickup + delivery) for the toast watcher.
 * After BML payment, online orders move to `pending` with
 * payment_status=paid — not status=paid.
 */
export async function fetchRecentOnlineOrders(limit = 10): Promise<IncomingOnlineOrder[]> {
  const res = await request<{
    data: Array<{
      id: number;
      order_number: string;
      type: string;
      status: string;
      total: number | string;
      created_at: string;
      customer?: { name?: string | null; phone?: string | null } | null;
    }>;
  }>(
    `/orders?online_only=1&status=pending,in_progress,preparing,ready&per_page=${limit}`,
  );
  return (res.data ?? []).map((o) => ({
    id: o.id,
    order_number: o.order_number,
    type: o.type,
    status: o.status,
    total: Number(o.total),
    customer_name: o.customer?.name ?? null,
    customer_phone: o.customer?.phone ?? null,
    created_at: o.created_at,
  }));
}

export async function fetchTables(): Promise<{ tables: RestaurantTable[] }> {
  return request<{ tables: RestaurantTable[] }>("/tables");
}

export async function createOrderBatch(payload: {
  orders: Array<{
    type: string;
    print?: boolean;
    device_identifier?: string;
    restaurant_table_id?: number | null;
    items: Array<{
      item_id?: number | null;
      name: string;
      quantity: number;
      variant_id?: number | null;
      modifiers?: Array<{
        modifier_id?: number | null;
        name: string;
        price: number;
      }>;
    }>;
  }>;
}): Promise<{ processed: number; failed: Array<{ index: number; error: string }> }> {
  return request("/orders/sync", { method: "POST", body: JSON.stringify(payload) });
}

export async function createOrderPayments(
  orderId: number,
  payload: {
    payments: Array<{
      method: string;
      amount: number;
      status?: string;
      reference_number?: string;
      idempotency_key?: string;
    }>;
    print_receipt?: boolean;
  }
): Promise<{ order: { id: number; total: number }; paid_total: number }> {
  return request(`/orders/${orderId}/payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getOrder(orderId: number): Promise<{
  order: {
    id: number;
    order_number?: string | null;
    // Server-authoritative totals — see POS-004. We surface `total`
    // here so handleResumeTicket can snapshot the figure the kitchen
    // and accounting already agreed on, instead of re-deriving it
    // from local cart math.
    total?: number;
    subtotal?: number;
    tax_amount?: number;
    status?: string;
    /** Ringing channel ("dine_in" | "takeaway" | "online_pickup" | ...).
     *  Surfaced here so handleResumeTicket can restore the cashier's
     *  pill selection on resume — otherwise a held Dine-in ticket
     *  came back as the default Takeaway/Dine-in and the Charge step
     *  silently re-routed it. */
    type?: string;
    /** Same story for the table the ticket was rung against. */
    restaurant_table_id?: number | null;
    /** Financial state — independent of `status`. Set to 'paid' the
     *  moment payments cover the total (either via /payments or
     *  via the BML webhook for an online pay-link redemption). The
     *  resume flow checks this to detect "customer paid online
     *  while ticket was open" and short-circuits Charge → Receipt. */
    payment_status?: "unpaid" | "partial" | "paid" | null;
    /** Manual cashier-applied discount (MVR amount). Hydrated on resume
     *  so the cart sidebar shows the same discount line the cashier
     *  applied when the ticket was held. */
    discount_amount?: number | string | null;
    /** Gift card code applied to the ticket + the laari value redeemed.
     *  Surface both so resume can re-paint the rewards row without an
     *  extra round-trip to validate the code. */
    gift_card_code?: string | null;
    gift_card_discount_laar?: number | null;
    /** Loyalty laari held against the ticket — non-null when the
     *  cashier redeemed points before holding. Used to repaint the
     *  rewards strip without re-requesting a fresh hold. */
    loyalty_discount_laar?: number | null;
    /** Promo discount applied (laari) — surfaces same as above for
     *  the promo row. The promo CODE itself isn't stored on the order
     *  (lives in the redemption table), so the cart shows "Promo: -MVR x"
     *  without the code text. */
    promo_discount_laar?: number | null;
    /** Customer linked to the ticket when it was held, so the picker
     *  re-attaches them on resume and the bill SMS still goes to the
     *  right phone. Null/undefined for walk-in tickets. */
    customer?: PosCustomer | null;
    /** Staff cashier who rang the ticket — null for customer-app orders. */
    user_id?: number | null;
    user?: { id: number; name?: string | null } | null;
    items: Array<{
      item_id: number | null;
      item_name: string;
      variant_id?: number | null;
      variant_name?: string | null;
      unit_price: number;
      quantity: number;
      /** Per-item tax_rate snapshot stored at order-create time. The POS
       *  reuses this when resuming a held ticket so the cart still shows
       *  the correct GST line. */
      tax_rate?: number | string | null;
      /** Free-form kitchen note (e.g. "No salt · Extra spicy"). The
       *  POS joins selected quick-note chips with " · " before saving;
       *  on resume we split back on " · " so the chip picker shows
       *  the same selections the cashier originally made. */
      notes?: string | null;
      modifiers?: Array<{
        modifier_id: number | null;
        modifier_name: string;
        modifier_price: number;
      }>;
    }>;
  };
}> {
  return request(`/orders/${orderId}`);
}

export async function holdOrder(
  orderId: number,
  payload?: { ticket_name?: string; ticket_note?: string },
): Promise<void> {
  await request(`/orders/${orderId}/hold`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export async function resumeOrder(orderId: number): Promise<void> {
  await request(`/orders/${orderId}/resume`, { method: "POST" });
}

/**
 * Phone-call pickup workflow: cashier picks "Save & Fire" in the
 * Save modal → POS creates the order normally (kitchen prints
 * because print:true is the default), but for held tickets the
 * cashier later wants to fire we hit this endpoint instead of
 * resume + charge. Transitions held → pending, fires kitchen
 * print, sends "Order received" SMS to the customer.
 *
 * Idempotent — calling on an already-fired order just refreshes
 * the kitchen print (cashier asked for a reprint).
 */
export async function fireOrderToKitchen(orderId: number): Promise<void> {
  await request(`/orders/${orderId}/fire-to-kitchen`, { method: "POST" });
}

/**
 * Send the customer a BML Connect pay link by SMS for the remaining
 * balance on this order. Powers the "Send pay link" button on the
 * Open Tickets row. The backend computes the outstanding amount
 * (order total minus any cash/card already taken) so it works for
 * split-tender scenarios too.
 *
 * Returns the amount that was charged on the link so the toast
 * can confirm "Pay link sent for MVR X.XX to +9607...".
 */
export async function sendPayLink(
  orderId: number,
): Promise<{ message: string; amount: number; sent_to: string }> {
  return request(`/orders/${orderId}/send-pay-link`, { method: "POST" });
}

/**
 * Cashier-callable lifecycle bumps — let a cashier-only setup move a
 * pickup order through "ready → completed" without needing a KDS
 * terminal in the kitchen. The backend reuses the same state
 * transitions KDS uses, so the existing "Ready for pickup!" SMS
 * still fires once on transition to ready, and OrderCompleted +
 * loyalty awards still fire on transition to completed.
 *
 * `markPickedUp` is guarded server-side: it refuses to close an
 * unpaid order. Take payment first (cash, card, or Send pay link)
 * before tapping "Picked up".
 *
 * The {unchanged: true} return flag distinguishes a real transition
 * from a no-op (e.g. cashier double-tapped) so the UI can suppress
 * a duplicate toast.
 */
/** POS "Start cooking" — pending/paid → in_progress (KDS Pending → Cooking). */
export async function startOrderCooking(
  orderId: number,
): Promise<{ order: { id: number; status: string }; unchanged: boolean }> {
  return request(`/orders/${orderId}/start-cooking`, { method: "POST" });
}

export async function markOrderReady(
  orderId: number,
): Promise<{ order: { id: number; status: string }; unchanged: boolean }> {
  return request(`/orders/${orderId}/mark-ready`, { method: "POST" });
}

export async function markOrderPickedUp(
  orderId: number,
): Promise<{ order: { id: number; status: string }; unchanged: boolean }> {
  return request(`/orders/${orderId}/mark-picked-up`, { method: "POST" });
}

/**
 * Void a non-terminal ticket from the POS Active Orders panel.
 *
 * Backend:
 *  - refuses paid / completed / refunded / partially_refunded (use refund flow)
 *  - returns deducted POS stock to the shelves (idempotent)
 *  - releases promo / loyalty / gift-card holds via OrderCancelled event
 *  - frees the dine-in table if no other active order sits on it
 *  - audit-logs the cashier + reason
 *
 * `reason` is a short free-form note ("Customer changed mind", "Walked
 * out", "Wrong items") capped at 255 chars on the server. Required.
 */
export async function cancelOrder(
  orderId: number,
  reason: string,
): Promise<{ order: { id: number; status: string }; unchanged: boolean }> {
  return request(`/orders/${orderId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/**
 * Replace the line items on an existing (non-completed) order. Used by
 * the POS "Save changes" button when the cashier edited a resumed
 * active ticket. Backend wipes existing items, re-adds the payload,
 * recalculates totals via OrderTotalsCalculator, and optionally
 * reprints the kitchen chit.
 *
 * Refuses paid / completed / cancelled / refunded orders server-side.
 */
export async function updateOrderItems(
  orderId: number,
  payload: {
    items: Array<{
      item_id?: number | null;
      name: string;
      quantity: number;
      variant_id?: number | null;
      notes?: string;
      modifiers?: Array<{
        modifier_id?: number | null;
        name: string;
        price: number;
      }>;
    }>;
    reprint_kitchen?: boolean;
  },
): Promise<{ order: { id: number; total: number; subtotal: number; tax_amount: number } }> {
  return request(`/orders/${orderId}/items`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/**
 * Merge a source ticket into a target ticket. Items from `source_id`
 * are reparented onto `targetOrderId`; source is cancelled. Use when
 * the cashier consolidates two phone-call tickets or joins two table
 * parties. Server refuses if either order is paid/completed.
 */
export async function mergeOpenTickets(
  targetOrderId: number,
  payload: { source_id: number },
): Promise<{ order: { id: number; total: number } }> {
  return request(`/orders/${targetOrderId}/merge`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Split selected item ids off the source ticket into a brand-new
 * ticket. Useful when a customer wants to pay for only part of an
 * order (split bill on a phone-call pickup, or a dine-in party
 * splitting). Server returns both the slimmed-down source and the
 * brand-new split.
 */
export async function splitOpenTicket(
  sourceOrderId: number,
  payload: { item_ids: number[] },
): Promise<{
  source: { id: number; total: number };
  split: { id: number; total: number };
}> {
  return request(`/orders/${sourceOrderId}/split`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Receipts/orders list shaped for the POS — same backing endpoint as admin,
 * but with cashier-friendly filters (current shift, today, search).
 */
export async function fetchReceipts(params: {
  q?: string;
  date?: string;
  current_shift?: boolean;
  held_only?: boolean;
  /** Held OR fired-but-unpaid. Legacy — kept for callers that
   *  specifically want the narrower view (e.g. an end-of-shift
   *  "what's still owed me" check). */
  open_only?: boolean;
  /** Active Orders feed — non-terminal tickets that still need cashier
   *  action. Paid dine-in/takeaway are excluded (Receipts only); paid
   *  pickup/delivery stay until picked up or delivered. */
  active_only?: boolean;
  /** Manager view — surface anything cooking with a balance. */
  unpaid_only?: boolean;
  /** Active orders created by the logged-in cashier only. */
  created_by_me?: boolean;
  /** Active orders from the online ordering app (pickup + delivery). */
  online_only?: boolean;
  device_identifier?: string;
  per_page?: number;
  page?: number;
  status?: string;
  /** Restrict receipts to a specific shift. Used by ReceiptsPanel's
   *  "current shift" scope so the cashier sees only their own
   *  shift's sales, not the previous staffer's. Bug-046: this was
   *  previously cast through `unknown` to bypass the missing prop
   *  on this type — now properly declared. */
  shift_id?: number | string;
  /** Skip per-row payment_settlement on list polls. */
  slim?: boolean;
} = {}): Promise<{
  data: Array<{
    id: number;
    order_number: string;
    type: string;
    status: string;
    /** New: 'unpaid' | 'partial' | 'paid'. Independent of `status`,
     *  set by addPayments / BML webhook. Lets Open Tickets show an
     *  UNPAID badge without recomputing payments per row. */
    payment_status?: "unpaid" | "partial" | "paid" | null;
    /** New: timestamp the kitchen first saw the chit. NULL means
     *  the ticket is still parked (Save Ticket without Fire). */
    fired_at?: string | null;
    total: number;
    subtotal: number;
    discount_amount: number;
    created_at: string;
    customer?: { id: number; name?: string; phone?: string } | null;
    user?: { id: number; name?: string } | null;
    items?: Array<{ id: number; item_name: string; quantity: number; unit_price: number; total_price: number }>;
    ticket_name?: string | null;
    ticket_note?: string | null;
    /** Restaurant table the dine-in ticket was rung against. Surfaced
     *  here so the POS Active orders search can match on table name
     *  (e.g. cashier types "T4" → Table T4's open ticket bubbles
     *  up). Null/undefined for non-dine-in tickets. Relation method
     *  on the Order model is `table()`, so Laravel serialises it
     *  here as `table`. */
    restaurant_table_id?: number | null;
    table?: { id: number; name: string; location?: string | null } | null;
    delivery_island?: string | null;
  }>;
  /** Laravel paginator fields — present on GET /orders list responses. */
  total?: number;
  last_page?: number;
  current_page?: number;
  per_page?: number;
}> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  });
  return request(`/orders?${qs.toString()}`);
}

/** Venue-wide active order count — matches OpenTicketsPanel default scope. */
export async function countActiveOrders(): Promise<number> {
  const res = await fetchReceipts({ active_only: true, slim: true, per_page: 1, page: 1 });
  return res.total ?? res.data?.length ?? 0;
}

async function fetchActiveOrderPages(
  baseParams: Record<string, string | number | boolean | undefined>,
): Promise<{
  data: Awaited<ReturnType<typeof fetchReceipts>>["data"];
  total: number;
}> {
  const perPage = 100;
  const first = await fetchReceipts({ ...baseParams, active_only: true, slim: true, per_page: perPage, page: 1 });
  const out: Awaited<ReturnType<typeof fetchReceipts>>["data"] = [...(first.data ?? [])];
  const total = first.total ?? out.length;
  const lastPage = Math.min(first.last_page ?? 1, 20);
  if (lastPage > 1) {
    const rest = await Promise.all(
      Array.from({ length: lastPage - 1 }, (_, i) =>
        fetchReceipts({ ...baseParams, active_only: true, slim: true, per_page: perPage, page: i + 2 }),
      ),
    );
    for (const res of rest) out.push(...(res.data ?? []));
  }
  return { data: out, total };
}

/** Active orders venue-wide (every station). Manager/owner scope. */
export async function fetchActiveOrdersVenueWide(): Promise<{
  data: Awaited<ReturnType<typeof fetchReceipts>>["data"];
  total: number;
}> {
  return fetchActiveOrderPages({});
}

/** Active orders created by the logged-in cashier only. */
export async function fetchActiveOrdersMine(): Promise<{
  data: Awaited<ReturnType<typeof fetchReceipts>>["data"];
  total: number;
}> {
  return fetchActiveOrderPages({ created_by_me: true });
}

/** Active online orders (ordering-app pickup + delivery). */
export async function fetchActiveOrdersOnline(): Promise<{
  data: Awaited<ReturnType<typeof fetchReceipts>>["data"];
  total: number;
}> {
  return fetchActiveOrderPages({ online_only: true });
}

/** Active orders for all in-flight venue tickets (staff default). */
export async function fetchActiveOrdersForCashier(): Promise<{
  data: Awaited<ReturnType<typeof fetchReceipts>>["data"];
  total: number;
}> {
  return fetchActiveOrdersVenueWide();
}

/** @deprecated Device scope removed — use fetchActiveOrdersMine instead. */
export async function fetchActiveOrdersForStation(
  _deviceIdentifier: string,
): Promise<{ data: Awaited<ReturnType<typeof fetchReceipts>>["data"]; total: number }> {
  return fetchActiveOrdersVenueWide();
}

export async function getReceiptLink(orderId: number): Promise<{ link: string }> {
  return request(`/orders/${orderId}/receipt-link`);
}

export async function sendReceipt(
  orderId: number,
  payload: { channel: "sms" | "email"; recipient: string },
): Promise<{ receipt: unknown; link: string }> {
  return request(`/receipts/${orderId}/send`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getShiftSummary(shiftId: number): Promise<{
  shift: { id: number; opened_at: string; opening_cash: number };
  cash_drawer: {
    opening_cash: number;
    cash_sales: number;
    cash_refunds: number;
    paid_in: number;
    paid_out: number;
    expected_cash: number;
  };
  sales_summary: {
    order_count: number;
    gross_sales: number;
    discounts: number;
    refunds: number;
    net_sales: number;
  };
  tenders: Record<string, number>;
  open_unpaid_orders?: number;
}> {
  return request(`/shifts/${shiftId}/summary`);
}

export async function getShiftHistory(): Promise<{
  shifts: Array<{
    id: number;
    user_id: number;
    device_id: number | null;
    opened_at: string;
    closed_at: string | null;
    opening_cash: number;
    closing_cash: number;
    expected_cash: number;
    variance: number;
    notes: string | null;
  }>;
}> {
  return request(`/shifts/history`);
}

export async function getTimeClockStatus(): Promise<{
  clocked_in: boolean;
  punch?: { id: number; clocked_in_at: string };
}> {
  return request(`/time-clock/status`);
}

export async function clockIn(): Promise<{ punch: { id: number; clocked_in_at: string } }> {
  return request(`/time-clock/in`, { method: "POST" });
}

export async function clockOut(): Promise<{ punch: { id: number; clocked_out_at: string; total_hours: number } }> {
  return request(`/time-clock/out`, { method: "POST" });
}

export async function getCurrentShift(): Promise<{
  shift: {
    id: number;
    opened_at: string;
    closed_at: string | null;
    opening_cash: number;
    closing_cash: number | null;
    expected_cash: number | null;
    variance: number | null;
  } | null;
}> {
  return request("/shifts/current");
}

export async function openShift(payload: {
  opening_cash: number;
  device_id?: number | null;
  notes?: string;
}): Promise<{ shift: { id: number } }> {
  return request("/shifts/open", { method: "POST", body: JSON.stringify(payload) });
}

export async function closeShift(
  shiftId: number,
  payload: { closing_cash: number; notes?: string }
): Promise<{
  shift: { id: number; expected_cash: number | null; variance: number | null };
  cash_sales: number;
  cash_in: number;
  cash_out: number;
  open_unpaid_orders?: number;
  message?: string;
}> {
  return request(`/shifts/${shiftId}/close`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createCashMovement(
  shiftId: number,
  payload: { type: "cash_in" | "cash_out"; amount: number; reason: string }
): Promise<{ movement: { id: number } }> {
  return request(`/shifts/${shiftId}/cash-movements`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSalesSummary(params: {
  from?: string;
  to?: string;
}): Promise<SalesSummary> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  return request(`/reports/sales-summary?${query.toString()}`);
}

export async function fetchInventory(): Promise<{
  items: {
    data: Array<{
      id: number;
      name: string;
      current_stock: number | null;
      unit: string;
    }>;
  };
}> {
  return request("/inventory");
}

export async function adjustInventory(
  itemId: number,
  payload: {
    quantity: number;
    type: "adjustment" | "waste" | "correction";
    notes?: string;
  }
): Promise<void> {
  await request(`/inventory/${itemId}/adjust`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type PreparedStockRow = {
  item_id: number;
  variant_id: number | null;
  name: string;
  stock: number;
  low_stock_threshold: number;
};

export async function fetchPreparedStock(): Promise<{ items: PreparedStockRow[] }> {
  return request("/prepared-stock");
}

export async function adjustPreparedStock(
  itemId: number,
  payload: { delta: number; variant_id?: number | null; notes?: string },
): Promise<{ message: string; item: PreparedStockRow }> {
  return request(`/items/${itemId}/prepared-stock/adjust`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchSuppliers(): Promise<{
  suppliers: { data: Array<{ id: number; name: string }> };
}> {
  return request("/suppliers");
}

export async function createSupplier(payload: {
  name: string;
  phone?: string;
  email?: string;
}): Promise<{ supplier: { id: number; name: string } }> {
  return request("/suppliers", { method: "POST", body: JSON.stringify(payload) });
}

export async function createPurchase(payload: {
  supplier_id?: number | null;
  purchase_date: string;
  items: Array<{
    inventory_item_id?: number | null;
    name: string;
    quantity: number;
    unit_cost: number;
  }>;
}): Promise<void> {
  await request("/purchases", { method: "POST", body: JSON.stringify(payload) });
}

export async function fetchRefunds(status?: string): Promise<{
  refunds: {
    data: Array<{
      id: number;
      amount: number;
      status: string;
      reason: string | null;
      order_id: number;
    }>;
  };
}> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return request(`/refunds${query}`);
}

export async function createRefund(
  orderId: number,
  payload: { amount: number; reason?: string; status?: string }
): Promise<{ refund: { id: number } }> {
  return request(`/orders/${orderId}/refunds`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function previewSmsPromotion(payload: {
  message: string;
  filters?: {
    active_only?: boolean;
    last_order_days?: number;
    min_orders?: number;
    include_opted_out?: boolean;
  };
}): Promise<{
  estimate: {
    encoding: string;
    length: number;
    segments: number;
    cost_mvr: number;
    recipient_count: number;
    total_cost_mvr: number;
  };
}> {
  return request("/sms/promotions/preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendSmsPromotion(payload: {
  name?: string;
  message: string;
  filters?: {
    active_only?: boolean;
    last_order_days?: number;
    min_orders?: number;
    include_opted_out?: boolean;
  };
}): Promise<{ promotion: { id: number; status: string } }> {
  return request("/sms/promotions/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Get the bill / invoice for an order. Two modes:
 *   - phone provided → SMS the customer with the public bill link
 *   - phone omitted  → ensure the invoice exists and just return its link
 *                      (so the POS "Print bill" can open /invoices/{token}
 *                       in a new tab without spamming an SMS).
 * Backend is idempotent on invoice creation, so this is safe to call multiple times.
 */
export async function sendBill(
  orderId: number,
  phone?: string,
): Promise<{ order: unknown; invoice: unknown; link: string }> {
  const body = phone ? { phone } : {};
  return request(`/orders/${orderId}/send-bill`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Link, change, or remove customer on an open order (paid pickup handover). */
export async function updateOrderCustomer(
  orderId: number,
  customerId: number | null,
): Promise<{ order: { customer?: PosCustomer | null } }> {
  return request(`/orders/${orderId}/customer`, {
    method: "PATCH",
    body: JSON.stringify({ customer_id: customerId }),
  });
}

export type PosOfflineSyncPayload = {
  orders: Array<{
    idempotency_key: string;
    local_order_id: string;
    local_order_number: string;
    device_identifier: string;
    shift_id: number;
    created_at_local: string;
    type: string;
    items: Array<{
      item_id: number;
      quantity: number;
      variant_id?: number;
      unit_price: number;
      modifiers?: Array<{ modifier_id: number; name?: string; price?: number }>;
      notes?: string;
    }>;
    totals: { subtotal: number; tax: number; total: number };
    payment: {
      method: "cash" | "card" | "bank_transfer";
      amount: number;
      reference?: string;
    };
    discount_amount?: number;
    customer_id?: number;
    rewards?: {
      promo_code?: string | null;
      loyalty_points?: number;
      gift_card_code?: string | null;
    };
    ticket_name?: string;
    ticket_note?: string;
    restaurant_table_id?: number;
    prepared_locally?: boolean;
  }>;
};

export type PosOfflineSyncResponse = {
  results: Array<{
    local_order_id: string;
    status: "synced" | "conflict" | "failed";
    server_order_id?: number;
    server_order_number?: string;
    inventory_conflict?: boolean;
    message?: string | null;
  }>;
};

export async function syncOfflineOrders(payload: PosOfflineSyncPayload): Promise<PosOfflineSyncResponse> {
  return request("/pos/offline-sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
