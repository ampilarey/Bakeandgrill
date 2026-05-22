import { req } from './client';

export type AuditLogRow = {
  id: number;
  user_id: number | null;
  action: string;
  model_type: string;
  model_id: number | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  user?: { id: number; name: string; email?: string } | null;
};

export type PosOverview = {
  open_shifts_count: number;
  open_shifts: Array<{
    id: number;
    user_id: number;
    user_name: string | null;
    device_id: number | null;
    device_name: string | null;
    device_identifier: string | null;
    opened_at: string;
    opening_cash: number;
  }>;
  active_tickets: number;
  pending_devices: number;
  today_voids: number;
  today_refunds: number;
  clocked_in_count: number;
  clocked_in: Array<{ user_id: number; user_name: string | null; clocked_in_at: string }>;
  recent_activity: Array<{
    id: number;
    action: string;
    user_name: string | null;
    model_type: string;
    model_id: number | null;
    created_at: string;
  }>;
};

export type ShiftHistoryRow = {
  id: number;
  user_id: number;
  device_id: number | null;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  variance: number | null;
  user?: { id: number; name: string };
  device?: { id: number; name: string; identifier?: string };
};

export type ShiftSummaryResponse = {
  shift: { id: number; opened_at: string; opening_cash: number; user_id: number; device_id: number | null };
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
};

export async function fetchPosOverview(): Promise<PosOverview> {
  return req('/admin/pos/overview');
}

export async function fetchPosStaffOptions(): Promise<{ staff: Array<{ id: number; name: string }> }> {
  return req('/admin/pos/staff-options');
}

export async function fetchAuditLogs(params?: {
  user_id?: number;
  action?: string;
  model_type?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  per_page?: number;
}): Promise<{ data: AuditLogRow[]; current_page: number; last_page: number; total: number }> {
  const qs = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  return req(`/admin/audit-logs?${qs}`);
}

export async function fetchAuditLogActions(): Promise<{ actions: string[] }> {
  return req('/admin/audit-logs/actions');
}

export async function fetchShiftHistory(): Promise<{ shifts: ShiftHistoryRow[] }> {
  return req('/shifts/history');
}

export async function fetchLiveShifts(): Promise<{ shifts: ShiftHistoryRow[] }> {
  return req('/shifts/live');
}

export async function fetchShiftSummary(id: number): Promise<ShiftSummaryResponse> {
  return req(`/shifts/${id}/summary`);
}

export async function forceCloseShift(id: number, notes?: string): Promise<{ message: string }> {
  return req(`/shifts/${id}/force-close`, {
    method: 'POST',
    body: JSON.stringify({ notes: notes ?? 'Force closed from admin' }),
  });
}

/** Human-readable labels for audit action slugs */
export function formatAuditAction(action: string): string {
  const map: Record<string, string> = {
    'order.created': 'Order created',
    'order.paid': 'Order paid',
    'order.cancelled': 'Order voided',
    'order.held': 'Ticket held',
    'order.resumed': 'Ticket resumed',
    'shift.opened': 'Shift opened',
    'shift.closed': 'Shift closed',
    'shift.force_closed': 'Shift force-closed',
    'payment.created': 'Payment recorded',
    'device.approved': 'Device approved',
    'device.rejected': 'Device rejected',
    'time_punch.clock_in': 'Clocked in',
    'time_punch.clock_out': 'Clocked out',
  };
  return map[action] ?? action.replace(/\./g, ' · ').replace(/_/g, ' ');
}
