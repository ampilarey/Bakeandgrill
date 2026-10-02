import { request } from "./client";

/**
 * Customer management from the till (owner, 2026-10-02: "add a customer tab
 * in the POS so he can manage all customers easily"). These call the same
 * admin endpoints the dashboard's Customers page uses, so the rules
 * (customers.manage, credit and deposit permissions, owner-only erase) are
 * enforced once on the server.
 */

export type CustomerListRow = {
  id: number;
  name: string | null;
  phone: string | null;
  email?: string | null;
  tier?: string | null;
  loyalty_points?: number;
  is_active?: boolean;
  sms_opt_out?: boolean;
  orders_count?: number;
  /** Segment lists count paid orders and spend instead. */
  orders_count_paid?: number;
  total_paid_spend?: number;
  last_order_at?: string | null;
  created_at?: string | null;
  credit_status?: string;
  credit_balance_laar?: number;
  /** Segment rows name it this way. */
  credit_balance?: number;
  badges?: string[];
};

export type CustomerListResponse = {
  data: CustomerListRow[];
  meta: { current_page: number; last_page: number; total: number };
};

export type CustomerSegment = { slug: string; label: string; count: number };

export type CustomerDetail = {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  tier: string | null;
  loyalty_points: number;
  is_active: boolean;
  sms_opt_out: boolean;
  internal_notes: string | null;
  orders_count: number;
  last_order_at: string | null;
  created_at: string | null;
  credit_enabled: boolean;
  credit_status: string;
  credit_limit_laar: number;
  credit_balance_laar: number;
};

export type CustomerDetailOrder = {
  id: number;
  order_number: string;
  status: string;
  type: string;
  total: number | string;
  created_at: string;
  paid_at: string | null;
};

export async function listCustomers(params: {
  search?: string;
  page?: number;
  segment?: string;
  is_active?: boolean;
}): Promise<CustomerListResponse> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  if (params.segment) qs.set("segment", params.segment);
  if (params.is_active !== undefined) qs.set("is_active", params.is_active ? "1" : "0");
  const q = qs.toString();
  return request(`/admin/customers${q ? `?${q}` : ""}`);
}

export async function listCustomerSegments(): Promise<{ segments: CustomerSegment[] }> {
  return request(`/admin/customers/segments`);
}

export async function getCustomerDetail(id: number): Promise<{ customer: CustomerDetail; orders: CustomerDetailOrder[] }> {
  return request(`/admin/customers/${id}`);
}

export async function updateCustomerDetail(
  id: number,
  patch: Partial<Pick<CustomerDetail, "name" | "email" | "date_of_birth" | "internal_notes" | "is_active" | "sms_opt_out">>,
): Promise<{ customer: CustomerDetail }> {
  return request(`/admin/customers/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function changeCustomerPhone(id: number, phone: string): Promise<{ message: string; customer: CustomerDetail }> {
  return request(`/admin/customers/${id}/phone`, { method: "PATCH", body: JSON.stringify({ phone }) });
}

export async function sendCustomerSms(id: number, message: string): Promise<{ message: string }> {
  return request(`/admin/customers/${id}/send-sms`, { method: "POST", body: JSON.stringify({ message }) });
}

export type TillMoneyMethod = "cash" | "card" | "bank_transfer";

export async function recordCreditRepayment(
  id: number,
  payload: { amount_mvr: number; method: TillMoneyMethod; reference?: string; notes?: string },
): Promise<unknown> {
  return request(`/admin/customers/${id}/credit/repayments`, { method: "POST", body: JSON.stringify(payload) });
}

export async function recordDepositTopUp(
  id: number,
  payload: { amount_mvr: number; method: TillMoneyMethod; reference?: string; notes?: string },
): Promise<unknown> {
  return request(`/admin/customers/${id}/deposit/top-up`, { method: "POST", body: JSON.stringify(payload) });
}
