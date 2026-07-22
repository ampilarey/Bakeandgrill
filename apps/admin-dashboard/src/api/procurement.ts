import { req } from './client';

export type PurchaseRequestItem = {
  id: number;
  inventory_item_id: number | null;
  menu_item_id: number | null;
  name: string;
  free_text_name: string | null;
  category: string | null;
  requested_qty: number;
  requested_unit: string;
  approved_qty: number | null;
  actual_qty: number | null;
  actual_unit: string | null;
  status: string;
  reason: string | null;
  notes: string | null;
  buyer_notes: string | null;
  supplier_name_text: string | null;
  bought_at: string | null;
  received_at: string | null;
  estimated_unit_cost_laar?: number | null;
  actual_unit_cost_laar?: number | null;
  actual_total_laar?: number | null;
  supplier_id?: number | null;
  verified_notes?: string | null;
  price_hint?: {
    last_paid: number | null;
    cheapest: { supplier_id: number; supplier_name: string | null; unit_price: number } | null;
  };
};

export type PurchaseRequest = {
  id: number;
  request_no: string;
  title: string | null;
  source: string;
  status: string;
  priority: string;
  needed_by: string | null;
  notes: string | null;
  rejection_reason: string | null;
  requested_by: number;
  requester: { id: number; name: string } | null;
  assigned_to: number | null;
  assignee: { id: number; name: string } | null;
  purchase_id: number | null;
  purchase?: { id: number; purchase_number: string } | null;
  expense_id: number | null;
  expense?: { id: number; expense_number: string } | null;
  total_estimated_laar?: number | null;
  total_actual_laar?: number | null;
  created_at: string;
  updated_at: string;
  items: PurchaseRequestItem[];
};

export function laarToMvr(laar: number | null | undefined): string {
  if (laar == null) return '—';
  return (laar / 100).toFixed(2);
}

export async function fetchPurchaseRequests(params?: {
  status?: string;
  priority?: string;
  page?: number;
}): Promise<{ data: PurchaseRequest[]; meta: { current_page: number; last_page: number; total: number } }> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.priority) q.set('priority', params.priority);
  if (params?.page) q.set('page', String(params.page));
  const qs = q.toString();
  return req(`/purchase-requests${qs ? `?${qs}` : ''}`);
}

export async function createPurchaseRequest(data: {
  title?: string;
  source?: 'pos' | 'kds' | 'admin';
  priority?: 'low' | 'normal' | 'urgent';
  needed_by?: string;
  notes?: string;
  items: Array<{
    free_text_name?: string;
    inventory_item_id?: number;
    menu_item_id?: number;
    category?: string;
    requested_qty: number;
    requested_unit: string;
    reason?: string;
    notes?: string;
  }>;
}): Promise<{ request: PurchaseRequest }> {
  return req('/purchase-requests', {
    method: 'POST',
    body: JSON.stringify({ source: 'admin', ...data }),
  });
}

export async function getPurchaseRequest(id: number): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${id}`);
}

export async function approvePurchaseRequest(id: number): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${id}/approve`, { method: 'POST' });
}

export async function rejectPurchaseRequest(id: number, reason?: string): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export async function assignPurchaseRequest(id: number, assignedTo: number): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${id}/assign`, { method: 'POST', body: JSON.stringify({ assigned_to: assignedTo }) });
}

export async function cancelPurchaseRequest(id: number): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${id}/cancel`, { method: 'POST' });
}

export async function updatePurchaseRequest(
  id: number,
  data: {
    title?: string;
    priority?: string;
    needed_by?: string;
    notes?: string;
    items?: Array<{ id: number; approved_qty?: number; requested_qty?: number; notes?: string }>;
  },
): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function verifyPurchaseRequestItem(
  requestId: number,
  itemId: number,
  data?: { inventory_item_id?: number; verified_notes?: string },
): Promise<{ item: PurchaseRequestItem; request: PurchaseRequest; warnings?: string[] }> {
  return req(`/purchase-requests/${requestId}/items/${itemId}/verify-received`, {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function verifyAllPurchaseRequestItems(id: number): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${id}/verify-all`, { method: 'POST' });
}

export async function convertPurchaseRequestToPurchase(id: number): Promise<{
  purchase: { id: number; purchase_number: string };
  request: PurchaseRequest;
}> {
  return req(`/purchase-requests/${id}/convert-to-purchase`, { method: 'POST' });
}

export async function convertPurchaseRequestToExpense(id: number): Promise<{
  expense: { id: number; expense_number: string };
  request: PurchaseRequest;
}> {
  return req(`/purchase-requests/${id}/convert-to-expense`, { method: 'POST' });
}

export async function promotePurchaseRequestItemToInventory(
  requestId: number,
  itemId: number,
  data: {
    name?: string;
    unit?: string;
    category_id?: number | null;
    reorder_point?: number | null;
    reorder_quantity?: number | null;
  },
): Promise<{
  item: PurchaseRequestItem;
  inventory_item: { id: number; name: string; unit: string };
  created: boolean;
  request: PurchaseRequest;
}> {
  return req(`/purchase-requests/${requestId}/items/${itemId}/promote-to-inventory`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getPurchaseRequestAutoExpenseSettings(): Promise<{
  settings: {
    auto_expense: boolean;
    default_expense_category_id: number | null;
    show_price_hints?: boolean;
    auto_on_low_stock?: boolean;
    auto_approve_under_laar?: number;
    auto_approve_under_mvr?: number;
    recurring_lists_enabled?: boolean;
  };
}> {
  return req('/purchase-requests/settings/auto-expense');
}

export async function updatePurchaseRequestAutoExpenseSettings(data: {
  auto_expense?: boolean;
  default_expense_category_id?: number | null;
  show_price_hints?: boolean;
  auto_on_low_stock?: boolean;
  auto_approve_under_mvr?: number | null;
  auto_approve_under_laar?: number | null;
  recurring_lists_enabled?: boolean;
}): Promise<{
  settings: {
    auto_expense: boolean;
    default_expense_category_id: number | null;
    show_price_hints?: boolean;
    auto_on_low_stock?: boolean;
    auto_approve_under_laar?: number;
    auto_approve_under_mvr?: number;
    recurring_lists_enabled?: boolean;
  };
  message: string;
}> {
  return req('/purchase-requests/settings/auto-expense', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function fetchPurchaseRequestReconciliation(params?: {
  from?: string;
  to?: string;
  buyer_id?: number;
}): Promise<{
  from: string;
  to: string;
  buyers: Array<{
    buyer_id: number;
    buyer_name: string;
    request_count: number;
    bought_laar: number;
    expense_laar: number;
    cash_out_laar: number;
    receipt_count: number;
    bought_vs_expense_laar: number;
    cash_vs_bought_laar: number;
  }>;
  totals: Record<string, number>;
}> {
  const q = new URLSearchParams();
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  if (params?.buyer_id) q.set('buyer_id', String(params.buyer_id));
  const qs = q.toString();
  return req(`/purchase-requests/reconciliation${qs ? `?${qs}` : ''}`);
}

export type RecurringShoppingList = {
  id: number;
  name: string;
  is_active: boolean;
  recurrence_interval: string;
  next_run_date: string | null;
  priority: string;
  title_template: string | null;
  items: Array<{
    id?: number;
    inventory_item_id: number | null;
    inventory_item_name?: string | null;
    free_text_name: string | null;
    qty: number;
    unit: string;
    estimated_unit_cost_laar: number | null;
  }>;
};

export async function fetchRecurringShoppingLists(): Promise<{ lists: RecurringShoppingList[] }> {
  return req('/recurring-shopping-lists');
}

export async function createRecurringShoppingList(data: Partial<RecurringShoppingList> & { name: string; items: RecurringShoppingList['items'] }): Promise<{ list: RecurringShoppingList }> {
  return req('/recurring-shopping-lists', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateRecurringShoppingList(id: number, data: Partial<RecurringShoppingList> & { items?: RecurringShoppingList['items'] }): Promise<{ list: RecurringShoppingList }> {
  return req(`/recurring-shopping-lists/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteRecurringShoppingList(id: number): Promise<{ message: string }> {
  return req(`/recurring-shopping-lists/${id}`, { method: 'DELETE' });
}

export async function mergePurchaseRequests(targetId: number, sourceIds: number[]): Promise<{ request: PurchaseRequest }> {
  return req(`/purchase-requests/${targetId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ source_ids: sourceIds }),
  });
}
