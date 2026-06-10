import { request } from "./client";

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
    /** MVR discount per loyalty point (from PointsCalculator). */
    redeem_mvr_per_point?: number;
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
  deposit?: {
    has_account: boolean;
    status: 'active' | 'frozen' | 'closed';
    balance_laar: number;
    can_use: boolean;
  };
};

export async function fetchCustomerSummary(customerId: number): Promise<PosCustomerSummary> {
  return request<PosCustomerSummary>(`/customers/${customerId}/pos-summary`);
}
