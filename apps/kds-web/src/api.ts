import { createApiClient } from '@shared/api';
import { createTokenStore, readStored } from '@shared/auth';
import { ENDPOINTS } from '@shared/api';

export type KdsOrderItem = {
  id: number;
  item_id?: number | null;
  parent_order_item_id?: number | null;
  item_name: string;
  variant_name?: string | null;
  quantity: number;
  kitchen_produced_qty?: number | null;
  kitchen_received_qty?: number | null;
  notes?: string | null;
  /** The recipe's method, for a cook who wants it. */
  recipe_instructions?: string | null;
  status?: string;
  menu_group_id?: number | null;
  prep_time_minutes?: number | null;
  is_available?: boolean | null;
  modifiers?: Array<{
    id: number;
    modifier_name: string;
  }>;
  /**
   * What a fixed bundle is made of. A platter's picks and any optional extra
   * the customer took arrive as their own lines instead, so this is null for
   * a platter and never repeats an optional. Quantities are already scaled by
   * the line.
   */
  bundle_contents?: Array<{
    name: string;
    quantity: number;
  }> | null;
};

export type KdsActivityRow = {
  id: number;
  action: string;
  model_type: string;
  model_id: number | null;
  user_name: string;
  meta?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  created_at: string | null;
};

export type KdsOrder = {
  id: number;
  order_number: string;
  status: string;
  type?: string;
  created_at: string;
  delivery_island?: string | null;
  delivery_summary?: string | null;
  table_number?: string | null;
  ticket_name?: string | null;
  notes?: string | null;
  /** What the customer typed on an online order. */
  customer_notes?: string | null;
  kitchen_done_at?: string | null;
  kitchen_done_by?: { id: number; name: string } | null;
  kitchen_handover_status?: string | null;
  pos_received_at?: string | null;
  /**
   * Kitchen audit, 2026-09-26: the column, from the kitchen's own timestamps.
   * The status alone cannot say it: a ticket paid at the till mid-cook reads
   * `paid`. Older servers leave it out and the screen falls back to status.
   */
  kitchen_lane?: "new" | "cooking" | "ready" | "cancelled";
  /** When the kitchen's clock started: fired, paid online, or the slot's lead time. */
  kitchen_clock_at?: string | null;
  kitchen_started_at?: string | null;
  /** A pickup booked for a time. */
  pickup_slot_at?: string | null;
  fired_at?: string | null;
  /** Set on a ticket cancelled in the last few minutes, shown flagged. */
  cancelled_at?: string | null;
  items: KdsOrderItem[];
};

export type KdsMenuGroup = {
  id: number;
  name: string;
};

export type KdsStaffUser = {
  id: number;
  name: string;
  role: string;
  role_label?: string;
  permissions: string[];
};

/**
 * Where this screen keeps its credentials. Keys unchanged from when they were
 * inline localStorage calls — renaming one signs every kitchen screen out on
 * the next deploy.
 */
export const kdsToken = createTokenStore('kds_token');
export const kdsUsername = createTokenStore('kds_username');
export const KDS_DEVICE_ID_KEY = 'kds_device_id';

const apiBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000/api');

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.warn('[CONFIG] VITE_API_BASE_URL is not set — falling back to same-origin /api');
}

const { request } = createApiClient({
  baseUrl: apiBaseUrl,
  getToken: () => kdsToken.get(),
});

/*
 * Every kitchen action (start, kitchen done, cooked, print, complete, recall)
 * sits behind the `device.active` middleware, which wants to know which
 * screen is acting. In production `pos.require_device_header` is on by
 * default, so a request without `X-Device-Identifier` is refused with 428
 * before it reaches the order — and this app never sent one. The id has
 * been on the sign-in screen the whole time; it just never left it.
 */
function authHeaders(token: string): Record<string, string> {
  const deviceId = readStored(KDS_DEVICE_ID_KEY);
  return {
    Authorization: `Bearer ${token}`,
    ...(deviceId ? { 'X-Device-Identifier': deviceId } : {}),
  };
}

/**
 * Tell the server this screen exists, under its own type, so it shows in
 * Admin → Devices as "KDS …" rather than as a till named after an id. Under
 * strict device approval the owner approves it there once; until then the
 * kitchen actions answer with the reason, which the board shows.
 */
export async function registerKdsDevice(token: string, identifier: string): Promise<void> {
  await request('/devices/self-register', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ identifier, name: `KDS ${identifier}`, type: 'kds' }),
  });
}

/** What to tell the cook when a call fails: the server's reason if it gave one. */
export function failureMessage(error: unknown, fallback: string): string {
  const status = (error as { status?: number })?.status;
  const message = (error as { message?: string })?.message;
  if (typeof status === 'number' && status >= 400 && status < 500 && message) {
    return message;
  }
  return fallback;
}

export async function staffLogin(
  username: string,
  pin: string,
  deviceIdentifier: string,
): Promise<string> {
  const data = await request<{ token: string }>(ENDPOINTS.STAFF_PIN_LOGIN, {
    method: 'POST',
    body: JSON.stringify({
      username: username.trim(),
      pin,
      device_identifier: deviceIdentifier,
    }),
  });
  return data.token;
}

export async function fetchMe(token: string): Promise<KdsStaffUser> {
  /*
   * Owner, 2026-09-11: "I created kitchen staff acc. But when he tries to
   * logon kds app it says no kds access for this account."
   *
   * GET /auth/me answers `{ "user": { ..., "permissions": [...] } }`, and this
   * returned that envelope while claiming to return the user inside it. So
   * `me.permissions` was undefined for everybody, the login screen's
   * `permissions.includes("kds.view")` was always false, and the app turned
   * away every account including the owner's. Typing the call
   * `request<KdsStaffUser>` is what hid it: TypeScript believed the assertion
   * and had nothing to compare it against.
   *
   * Every other call in this file already unwraps — data.orders, data.data,
   * data.activity, data.item. This one was missed because it is the only one
   * on the sign-in path, and the kitchen has been reading the board through
   * the admin dashboard instead.
   */
  const data = await request<{ user: KdsStaffUser }>(ENDPOINTS.AUTH_ME, {
    headers: authHeaders(token),
  });

  return data.user;
}

export async function fetchKdsOrders(
  token: string,
  onMeta?: (meta: { laterToday: number }) => void,
): Promise<KdsOrder[]> {
  const data = await request<{ orders: KdsOrder[]; later_today?: number }>(ENDPOINTS.KDS_ORDERS, {
    headers: authHeaders(token),
  });
  onMeta?.({ laterToday: Number(data.later_today ?? 0) });
  return data.orders ?? [];
}

export async function fetchKdsMenuGroups(token: string): Promise<KdsMenuGroup[]> {
  const data = await request<{ data: KdsMenuGroup[] }>('/kds/menu-groups', {
    headers: authHeaders(token),
  });
  return data.data ?? [];
}

export async function startOrder(token: string, orderId: number): Promise<void> {
  await request<void>(ENDPOINTS.KDS_ORDER_START(orderId), {
    method: 'POST',
    headers: authHeaders(token),
  });
}

export async function kitchenDoneOrder(token: string, orderId: number): Promise<void> {
  await request<void>(ENDPOINTS.KDS_ORDER_KITCHEN_DONE(orderId), {
    method: 'POST',
    headers: authHeaders(token),
  });
}

export async function markOrderItemCooked(
  token: string,
  orderId: number,
  orderItemId: number,
  payload?: { qty?: number; notes?: string },
): Promise<void> {
  await request<void>(ENDPOINTS.KDS_ORDER_ITEM_COOKED(orderId, orderItemId), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload ?? {}),
  });
}

export type KitchenProductionBatch = {
  id: number;
  batch_no: string;
  production_type: string;
  status: string;
  order?: { id: number; order_number: string; type?: string } | null;
  items: Array<{
    id: number;
    name: string;
    produced_qty: number;
    unit: string;
    status: string;
  }>;
};

export async function createKitchenProductionBatch(
  token: string,
  payload: Record<string, unknown>,
): Promise<{ batch: KitchenProductionBatch }> {
  return request('/kitchen-production', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function submitKitchenProductionBatch(token: string, batchId: number): Promise<void> {
  await request(`/kitchen-production/${batchId}/submit`, {
    method: 'POST',
    headers: authHeaders(token),
  });
}

/*
 * Owner, 2026-09-17: "admin/manager assign and requests items that should
 * be made for tomorrow and assign time and staff to do that, so when he
 * prepares and cashier receives the amount it will be in the prepared list
 * and will be added to the stock."
 *
 * The day's plan, line by line, as the kitchen's jobs. Sending what was
 * made creates and submits a prepared-stock batch tied to the line, so the
 * counter receives it like any other and the plan fills in by itself.
 */
export type KdsPlanTask = {
  id: number;
  item_id: number;
  variant_id: number;
  name: string;
  slot_label: string;
  slot_start: number;
  slot_end: number;
  slot_time: string;
  planned_qty: number;
  made_qty: number;
  received_qty: number;
  remaining: number;
  assigned_to: number | null;
  assigned_name: string | null;
  due_time: string | null;
  made_at: string | null;
  made_by_name: string | null;
  status: 'todo' | 'partial' | 'made' | 'received';
  /** The recipe's method, for the cook making it. */
  instructions?: string | null;
};

export async function fetchPlanTasks(token: string, date?: string): Promise<{ date: string; tasks: KdsPlanTask[] }> {
  const data = await request<{ date: string; tasks: KdsPlanTask[] }>(
    `/production-plan/tasks${date ? `?date=${encodeURIComponent(date)}` : ''}`,
    { headers: authHeaders(token) },
  );
  return { date: data.date, tasks: data.tasks ?? [] };
}

export async function markPlanTaskMade(
  token: string,
  taskId: number,
  qty: number,
  notes?: string,
): Promise<{ task: KdsPlanTask }> {
  return request(`/production-plan/tasks/${taskId}/made`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ qty, ...(notes ? { notes } : {}) }),
  });
}

export async function printKitchenTicket(token: string, orderId: number): Promise<void> {
  await request<void>(ENDPOINTS.KDS_ORDER_PRINT_TICKET(orderId), {
    method: 'POST',
    headers: authHeaders(token),
  });
}

export async function bumpOrder(token: string, orderId: number): Promise<void> {
  await request<void>(ENDPOINTS.KDS_ORDER_BUMP(orderId), {
    method: 'POST',
    headers: authHeaders(token),
  });
}

export async function recallOrder(token: string, orderId: number): Promise<void> {
  await request<void>(ENDPOINTS.KDS_ORDER_RECALL(orderId), {
    method: 'POST',
    headers: authHeaders(token),
  });
}

/**
 * Set an item sold out (available = false) or back on (true). The state is
 * sent, not a toggle, so a double tap or two screens at once cannot quietly
 * flip it back (kitchen audit, 2026-09-26).
 */
export async function markItem86(token: string, itemId: number, available?: boolean): Promise<{ is_available: boolean }> {
  const data = await request<{ item: { is_available: boolean } }>(`/kds/items/${itemId}/86`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(available === undefined ? {} : { available }),
  });
  return { is_available: !!data.item?.is_available };
}

export async function fetchKdsActivity(token: string): Promise<KdsActivityRow[]> {
  const data = await request<{ activity: KdsActivityRow[] }>('/kds/activity', {
    headers: authHeaders(token),
  });
  return data.activity ?? [];
}

export function hasKdsPermission(permissions: string[], slug: string): boolean {
  return permissions.includes(slug);
}

export type KdsPurchaseRequestItem = {
  id: number;
  name: string;
  requested_qty: number;
  requested_unit: string;
  approved_qty: number | null;
  status: string;
  /** The item's own picture — the thing, not a packet. */
  photo_url?: string | null;
  /** What the kitchen usually buys, or what the buyer recorded. */
  brand?: string | null;
  /**
   * A picture of each brand this item has been bought as, so the cook sent
   * to the shop picks a packet rather than reads a name. The POS buying
   * list had these; the KDS one did not (audit, 2026-09-18).
   */
  brand_photos?: { id: number; brand: string; url: string | null; note: string | null }[];
};

export type KdsPurchaseRequest = {
  id: number;
  request_no: string;
  status: string;
  priority: string;
  items: KdsPurchaseRequestItem[];
};

function prHeaders(token: string) {
  return authHeaders(token);
}

/**
 * One line of the list the kitchen picks from — same catalogue the POS uses,
 * and the same reason it is not `/inventory`: kitchen staff can raise a
 * request and hold no inventory.view.
 */
export type KdsCatalogItem = {
  id: number;
  name: string;
  /** The item's own picture, so the cook picks the right thing (owner, 2026-09-18). */
  photo_url?: string | null;
  unit: string;
  category_id: number | null;
  category: string | null;
  current_stock: number;
  reorder_point: number | null;
  suggested_qty: number | null;
};

export async function fetchRequestCatalog(token: string): Promise<{
  items: KdsCatalogItem[];
  categories: Array<{ id: number; name: string }>;
}> {
  return request('/purchase-requests/catalog', { headers: prHeaders(token) });
}

/** One line waiting at the back door. */
export type KdsToReceiveItem = {
  id: number;
  request_id: number;
  request_no: string | null;
  name: string;
  photo_url?: string | null;
  /** The brand the buyer recorded, and its packet when the item has one. */
  brand?: string | null;
  brand_photo_url?: string | null;
  qty: number;
  unit: string;
  shop: string | null;
  bought_by: string | null;
  partial: boolean;
  requested_by: string | null;
  can_receive: boolean;
  blocked_reason: string | null;
};

export async function fetchItemsToReceive(token: string): Promise<{ items: KdsToReceiveItem[] }> {
  return request('/purchase-requests/to-receive', { headers: prHeaders(token) });
}

export async function receivePurchaseRequestItem(
  token: string,
  requestId: number,
  itemId: number,
  payload: { verified_notes?: string } = {},
): Promise<unknown> {
  return request(`/purchase-requests/${requestId}/items/${itemId}/verify-received`, {
    method: 'POST',
    headers: prHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function createPurchaseRequest(
  token: string,
  payload: {
    source: "kds" | "pos" | "admin";
    priority?: string;
    items: Array<{
      inventory_item_id?: number;
      free_text_name?: string;
      category?: string;
      requested_qty: number;
      requested_unit: string;
      reason?: string;
      notes?: string;
    }>;
  },
): Promise<{ request: KdsPurchaseRequest }> {
  return request(`/purchase-requests`, {
    method: 'POST',
    headers: prHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function fetchMyPurchaseRequests(token: string): Promise<{ data: KdsPurchaseRequest[] }> {
  return request('/purchase-requests/my', { headers: prHeaders(token) });
}

export async function fetchAssignedPurchaseRequests(token: string): Promise<{ data: KdsPurchaseRequest[] }> {
  return request('/purchase-requests/assigned-to-me', { headers: prHeaders(token) });
}

export async function markPurchaseRequestItemBought(
  token: string,
  requestId: number,
  itemId: number,
  payload: { actual_qty?: number; brand?: string; buyer_notes?: string },
): Promise<void> {
  await request(`/purchase-requests/${requestId}/items/${itemId}/mark-bought`, {
    method: 'POST',
    headers: prHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function markPurchaseRequestItemPartial(
  token: string,
  requestId: number,
  itemId: number,
  payload: { actual_qty: number; brand?: string },
): Promise<void> {
  await request(`/purchase-requests/${requestId}/items/${itemId}/mark-partial`, {
    method: 'POST',
    headers: prHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function markPurchaseRequestItemNotAvailable(
  token: string,
  requestId: number,
  itemId: number,
  notes?: string,
): Promise<void> {
  await request(`/purchase-requests/${requestId}/items/${itemId}/mark-not-available`, {
    method: 'POST',
    headers: prHeaders(token),
    body: JSON.stringify({ buyer_notes: notes }),
  });
}

export async function uploadPurchaseRequestAttachment(
  token: string,
  requestId: number,
  file: File,
  type: 'request_photo' | 'receipt',
): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  form.append('type', type);
  await request(`/purchase-requests/${requestId}/attachments`, {
    method: 'POST',
    headers: prHeaders(token),
    body: form,
  });
}
