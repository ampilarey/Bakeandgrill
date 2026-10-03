import type { SalesSummary } from "@shared/types";
import { request } from "./client";

export async function getShiftSummary(shiftId: number): Promise<{
  shift: { id: number; opened_at: string; opening_cash: number };
  cash_drawer: {
    opening_cash: number;
    cash_sales: number;
    cash_refunds: number;
    paid_in: number;
    paid_out: number;
    /**
     * Blind count: OMITTED by the server while the shift is open unless the
     * viewer is owner/manager. Absent ≠ zero.
     */
    expected_cash?: number;
    /** FIX 4 — cash-in tagged as credit_repayment for this shift (already counted in paid_in). */
    credit_repayments_cash?: number;
    credit_repayments_cash_laar?: number;
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

export type ForeignCurrencyHeld = {
  currency: string;
  denomination: number;
  count: number;
  accepted_mvr_laari?: number;
  accepted_mvr: number;
};

export type ShiftHistoryRow = {
  id: number;
  user_id: number;
  device_id: number | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number;
  /** Absent for cashiers — the server strips the drawer reconciliation. */
  expected_cash?: number | null;
  variance?: number | null;
  cash_count_method?: "denominations" | "plain_total" | null;
  cash_count_breakdown?: Record<string, number> | null;
  foreign_currency_held?: ForeignCurrencyHeld[] | null;
  notes: string | null;
  /** Who ran it and on which till (shift history audit, 2026-10-02). */
  user?: { id: number; name: string } | null;
  device?: { id: number; name: string; identifier?: string } | null;
  /** Set when a manager force-closed it: the drawer was never counted. */
  force_closed_at?: string | null;
  force_closer?: { id: number; name: string } | null;
  /** The last close on this till and how far the typed float was from it. */
  opening_float_expected?: number | null;
  opening_float_variance?: number | null;
  /** How the float was counted at open, and the notes when counted one by one. */
  opening_count_method?: "denominations" | "plain_total" | null;
  opening_count_breakdown?: Record<string, number> | null;
};

export type ShiftHistoryParams = { from?: string; to?: string; user_id?: number; limit?: number };

export async function getShiftHistory(params?: ShiftHistoryParams): Promise<{ shifts: ShiftHistoryRow[] }> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.user_id) qs.set("user_id", String(params.user_id));
  if (params?.limit) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return request(`/shifts/history${q ? `?${q}` : ""}`);
}

/** Every shift open right now, on any till (owners and managers only). */
export async function getLiveShifts(): Promise<{ shifts: ShiftHistoryRow[] }> {
  return request(`/shifts/live`);
}

export async function forceCloseShift(shiftId: number, notes?: string): Promise<{ message: string }> {
  return request(`/shifts/${shiftId}/force-close`, {
    method: "POST",
    body: JSON.stringify({ notes: notes ?? "Force closed from the till" }),
  });
}

/** The 409 body when another cashier's shift is open on this till. */
export type OpenShiftConflict = {
  message: string;
  open_shift: { id: number; user_id: number; user_name: string | null; opened_at: string | null };
  can_override: boolean;
};

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
  /** The float. On the note-by-note path the server totals the notes itself. */
  opening_cash: number;
  /** Owner, 2026-10-03: the float counted like the close — note by note, or a plain total. */
  opening_count_method?: "denominations" | "plain_total";
  /** denomination (laari) → count, when counted note by note. */
  opening_denominations?: Record<string, number>;
  device_id?: number | null;
  notes?: string;
  /** Manager: open over another cashier's shift on this till. */
  override?: boolean;
}): Promise<{ shift: { id: number } }> {
  return request("/shifts/open", { method: "POST", body: JSON.stringify(payload) });
}

export async function closeShift(
  shiftId: number,
  payload: {
    closing_cash: number;
    notes?: string;
    cash_count_method?: "denominations" | "plain_total";
    denominations?: Record<string, number>;
    foreign_currency?: Array<{
      currency: string;
      denomination: number;
      count: number;
      accepted_mvr: number;
    }>;
  }
): Promise<{
  /** expected_cash / variance are stripped for cashiers. */
  shift: { id: number; expected_cash?: number | null; variance?: number | null };
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

/**
 * Blind-count review: records a count attempt server-side. Does NOT close
 * the shift and needs no variance reason. Cashiers get only {matches,
 * attempt_number}; owner/manager responses also carry the reconciliation
 * numbers — the UI renders whatever the server chose to reveal.
 */
export async function recordCountAttempt(
  shiftId: number,
  payload: {
    closing_cash: number;
    cash_count_method?: "denominations" | "plain_total";
    denominations?: Record<string, number>;
    foreign_currency?: Array<{
      currency: string;
      denomination: number;
      count: number;
      accepted_mvr: number;
    }>;
  }
): Promise<{
  matches: boolean;
  attempt_number: number;
  counted_cash?: number;
  expected_cash?: number;
  variance?: number;
}> {
  return request(`/shifts/${shiftId}/count-attempt`, {
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

/** Raw backend shape from GET /reports/sales-breakdown */
export type SalesBreakdownReport = {
  from: string;
  to: string;
  items: Array<{
    item_id: number | null;
    item_name: string;
    quantity: number | string;
    total: number | string;
  }>;
  categories: Array<{
    category_id: number;
    category_name: string;
    quantity: number | string;
    total: number | string;
  }>;
  employees: Array<{
    user_id: number | null;
    name: string | null;
    orders_count: number;
    total: number;
  }>;
};

export async function getSalesBreakdown(params: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<SalesBreakdownReport> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.limit) query.set("limit", String(params.limit));
  return request(`/reports/sales-breakdown?${query.toString()}`);
}

export type DiscountsByTypeReport = {
  from: string;
  to: string;
  total_applied: number;
  rows: Array<{
    type: string;
    amount: number;
    orders_count: number;
  }>;
};

export async function getDiscountsByType(params: {
  from?: string;
  to?: string;
}): Promise<DiscountsByTypeReport> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  return request(`/reports/discounts-by-type?${query.toString()}`);
}
