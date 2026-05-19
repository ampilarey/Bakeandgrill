import { createApiClient } from "@shared/api";
import type {
  Category,
  MenuItem as Item,
  RestaurantTable,
  SalesSummary,
  StaffLoginResponse,
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

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.warn("[CONFIG] VITE_API_BASE_URL is not set — falling back to same-origin /api");
}

// Module-level token — initialised from localStorage so page refresh
// doesn't silently log out the POS. Cleared on explicit logout.
let _token: string | null = localStorage.getItem('pos_token');
export function setAuthToken(t: string | null): void {
  _token = t;
}

const { request: _coreRequest } = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => _token,
});

// Wraps every API call: injects X-Device-Identifier header and handles
// device-blocked (disabled/pending/rejected) errors gracefully.
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
    const msg = (e as Error).message ?? '';
    if (
      msg.includes('Device disabled') ||
      msg.includes('Device pending') ||
      msg.includes('Device rejected')
    ) {
      window.dispatchEvent(new CustomEvent('pos_device_blocked', { detail: msg }));
    }
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
    "/categories",
  );
  return data.categories ?? data.data ?? [];
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
export async function fetchPosQuickNotes(): Promise<string[]> {
  try {
    const data = await request<{ settings: Record<string, string | null> }>(
      "/site-settings/public",
    );
    const raw = data.settings?.pos_quick_notes;
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
  const qs = channel ? `?channel=${encodeURIComponent(channel)}` : "";
  const data = await request<{ data: Item[] }>(`/items${qs}`);
  return data.data ?? [];
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

export async function selfRegisterDevice(identifier: string, name: string): Promise<{ status: string }> {
  return request<{ status: string }>("/devices/self-register", {
    method: "POST",
    body: JSON.stringify({ identifier, name, type: "pos" }),
  });
}

export async function selfDeviceStatus(identifier: string): Promise<{ status: string; is_active?: boolean }> {
  return request<{ status: string; is_active?: boolean }>(`/devices/self-status?identifier=${encodeURIComponent(identifier)}`);
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
}): Promise<{ order: { id: number; total: number } }> {
  return request("/orders", { method: "POST", body: JSON.stringify(payload) });
}

export async function searchCustomers(q: string): Promise<{ data: PosCustomer[] }> {
  return request<{ data: PosCustomer[] }>(`/customers/search?q=${encodeURIComponent(q)}`);
}

export async function quickCreateCustomer(
  payload: { phone: string; name?: string },
): Promise<{ customer: PosCustomer; created: boolean }> {
  return request(`/customers/quick`, { method: "POST", body: JSON.stringify(payload) });
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
  status: string;
  total: number;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
};

/**
 * Fetch the most recent online-pickup orders for the toast watcher. We
 * poll this every ~30s, compare the highest id we've seen, and toast
 * anything newer. Status filter excludes already-delivered orders so a
 * stale handed-over order doesn't re-toast every refresh.
 */
export async function fetchRecentOnlineOrders(limit = 10): Promise<IncomingOnlineOrder[]> {
  const res = await request<{
    data: Array<{
      id: number;
      order_number: string;
      status: string;
      total: number | string;
      created_at: string;
      customer?: { name?: string | null; phone?: string | null } | null;
    }>;
  }>(
    `/orders?type=online_pickup&status=paid,confirmed,preparing,ready&per_page=${limit}`,
  );
  return (res.data ?? []).map((o) => ({
    id: o.id,
    order_number: o.order_number,
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
    // Server-authoritative totals — see POS-004. We surface `total`
    // here so handleResumeTicket can snapshot the figure the kitchen
    // and accounting already agreed on, instead of re-deriving it
    // from local cart math.
    total?: number;
    subtotal?: number;
    tax_amount?: number;
    status?: string;
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
 * Receipts/orders list shaped for the POS — same backing endpoint as admin,
 * but with cashier-friendly filters (current shift, today, search).
 */
export async function fetchReceipts(params: {
  q?: string;
  date?: string;
  current_shift?: boolean;
  held_only?: boolean;
  device_identifier?: string;
  per_page?: number;
  status?: string;
} = {}): Promise<{
  data: Array<{
    id: number;
    order_number: string;
    type: string;
    status: string;
    total: number;
    subtotal: number;
    discount_amount: number;
    created_at: string;
    customer?: { id: number; name?: string; phone?: string } | null;
    items?: Array<{ id: number; item_name: string; quantity: number; unit_price: number; total_price: number }>;
    ticket_name?: string | null;
    ticket_note?: string | null;
  }>;
}> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  });
  return request(`/orders?${qs.toString()}`);
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
