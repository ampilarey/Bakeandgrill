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
