import { req } from './client';

// ── Inventory ─────────────────────────────────────────────────────────────────

/**
 * Admin-facing inventory row. The backend `InventoryItem` model uses
 * `current_stock`, `reorder_point`, `unit_cost`, and `inventory_category_id`,
 * but the admin page (and a handful of legacy callers) refer to
 * `quantity_on_hand`, `reorder_level`, and `cost_per_unit`. Rather
 * than rename every reference in the UI, the fetch helpers below
 * normalise the response into this shape — the admin pages keep their
 * existing field names and the backend stays untouched.
 *
 * Also: `fetchInventoryItems` previously read `res.data` but the
 * controller returns `{ items: paginator }`, so the table was always
 * empty regardless of the field-name mismatch. We unwrap both.
 */
export interface InventoryItem {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number | null;
  cost_per_unit: number | null;
  category: { id: number; name: string } | null;
  is_active: boolean;
  last_counted_at: string | null;
  created_at: string;
}

export interface InventoryCategory {
  id: number;
  name: string;
  slug: string | null;
  created_at: string;
}

type BackendInventoryRow = {
  id: number;
  name: string;
  sku: string | null;
  unit: string;
  current_stock: number | string | null;
  reorder_point: number | string | null;
  unit_cost: number | string | null;
  category?: { id: number; name: string } | null;
  inventory_category_id?: number | null;
  is_active: boolean;
  last_counted_at?: string | null;
  created_at: string;
};

function mapInventoryRow(row: BackendInventoryRow): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku ?? null,
    unit: row.unit,
    quantity_on_hand: Number(row.current_stock ?? 0),
    reorder_level: row.reorder_point != null ? Number(row.reorder_point) : null,
    cost_per_unit: row.unit_cost != null ? Number(row.unit_cost) : null,
    category: row.category ?? null,
    is_active: row.is_active,
    last_counted_at: row.last_counted_at ?? null,
    created_at: row.created_at,
  };
}

export async function fetchInventoryItems(params?: {
  search?: string; category_id?: number; low_stock?: boolean; page?: number;
}): Promise<{ data: InventoryItem[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.search)      qs.set('search',      params.search);
  if (params?.category_id) qs.set('category_id', String(params.category_id));
  if (params?.low_stock)   qs.set('low_stock',   '1');
  if (params?.page)        qs.set('page',        String(params.page));
  const res = await req<{
    items: {
      data: BackendInventoryRow[];
      current_page: number;
      last_page: number;
      total: number;
    };
  }>(`/inventory?${qs}`);
  return {
    data: (res.items?.data ?? []).map(mapInventoryRow),
    meta: {
      current_page: res.items?.current_page ?? 1,
      last_page:    res.items?.last_page ?? 1,
      total:        res.items?.total ?? 0,
    },
  };
}

export async function fetchLowStockItems(): Promise<{ data: InventoryItem[] }> {
  const res = await req<{ items: BackendInventoryRow[] }>('/inventory/low-stock');
  return { data: (res.items ?? []).map(mapInventoryRow) };
}

/**
 * Adjust stock by a signed delta. The backend `AdjustInventoryRequest`
 * expects `{ type: 'adjustment'|'waste'|'correction', quantity: <signed>,
 * notes? }` and does `current_stock + quantity`. The legacy UI shape
 * (`add`/`remove`/`set` with positive quantity + `reason`) is mapped
 * here so the page can keep its existing modal semantics.
 *
 * For `'set'` mode the caller supplies the target and the current stock
 * so we can compute the delta — without that the backend has no way to
 * "set to N" because all moves are delta-based.
 */
export async function adjustInventoryStock(
  id: number,
  data: { delta: number; notes?: string; type?: 'adjustment' | 'waste' | 'correction' },
): Promise<{ item: InventoryItem; movement: unknown }> {
  const res = await req<{ item: BackendInventoryRow; movement: unknown }>(
    `/inventory/${id}/adjust`,
    {
      method: 'POST',
      body: JSON.stringify({
        type: data.type ?? 'adjustment',
        quantity: data.delta,
        notes: data.notes,
      }),
    },
  );
  return { item: mapInventoryRow(res.item), movement: res.movement };
}

export async function fetchInventoryCategories(): Promise<{ categories: InventoryCategory[] }> {
  return req('/inventory-categories');
}

export async function createInventoryCategory(data: { name: string }): Promise<{ category: InventoryCategory }> {
  return req('/inventory-categories', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateInventoryCategory(id: number, data: { name: string }): Promise<{ category: InventoryCategory }> {
  return req(`/inventory-categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// ── Tables ────────────────────────────────────────────────────────────────────

/**
 * Schema mirror of `restaurant_tables` (see StoreTableRequest +
 * RestaurantTable model on the backend). Field names match the DB:
 *   - `name` is the human-facing label (e.g. "1", "A1", "VIP-3");
 *     the backend treats it as unique-per-restaurant.
 *   - `location` is the zone/area (e.g. "Indoor", "Terrace").
 * Earlier this file aliased these to `number` / `zone`, which made
 * every Add/Edit Table request fail validation ("name field is
 * required") and made the list look empty because the response key
 * is `tables`, not `data`.
 */
export interface RestaurantTable {
  id: number;
  name: string;
  capacity: number | null;
  location: string | null;
  status: 'available' | 'occupied' | 'reserved' | 'closed';
  current_order_id: number | null;
  current_order_number: string | null;
  current_order_total: number | null;
  is_active: boolean;
}

export async function fetchTables(): Promise<{ tables: RestaurantTable[] }> {
  return req('/tables');
}

export async function createTable(data: { name: string; capacity?: number; location?: string }): Promise<{ table: RestaurantTable }> {
  return req('/tables', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTable(id: number, data: Partial<{ name: string; capacity: number; location: string; is_active: boolean }>): Promise<{ table: RestaurantTable }> {
  return req(`/tables/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function openTable(id: number): Promise<{ table: RestaurantTable }> {
  return req(`/tables/${id}/open`, { method: 'POST' });
}

export async function closeTable(id: number): Promise<{ table: RestaurantTable }> {
  return req(`/tables/${id}/close`, { method: 'POST' });
}

/**
 * Merge two tables. The backend (`MergeTablesRequest`) requires explicit
 * `source_table_id` and `target_table_id` — the source's active ticket is
 * moved onto the target. The earlier `table_ids` payload didn't match
 * any validation rule and merge silently 422'd.
 */
export async function mergeTables(
  sourceTableId: number,
  targetTableId: number,
): Promise<{ target_order: unknown; source_table: RestaurantTable; target_table: RestaurantTable }> {
  return req('/tables/merge', {
    method: 'POST',
    body: JSON.stringify({ source_table_id: sourceTableId, target_table_id: targetTableId }),
  });
}

/**
 * Split a table's open ticket. Backend supports two modes via
 * `SplitTableBillRequest`:
 *   - by amount  → `{ order_id, amount }`
 *   - by item    → `{ order_id, item_ids: [...] }`
 * Both produce a sibling order on the same table that the cashier can
 * settle independently. The "split into N tables" UI of the old client
 * never existed on the backend.
 */
export async function splitTableByAmount(
  tableId: number,
  orderId: number,
  amount: number,
): Promise<{ order: unknown; split_order: { id: number; total: number } }> {
  return req(`/tables/${tableId}/split`, {
    method: 'POST',
    body: JSON.stringify({ order_id: orderId, amount }),
  });
}

export async function splitTableByItems(
  tableId: number,
  orderId: number,
  itemIds: number[],
): Promise<{ order: unknown; split_order: { id: number; total: number } }> {
  return req(`/tables/${tableId}/split`, {
    method: 'POST',
    body: JSON.stringify({ order_id: orderId, item_ids: itemIds }),
  });
}

// ── Shifts & Cash Drawer ──────────────────────────────────────────────────────

export interface CashMovement {
  id: number;
  type: 'cash_in' | 'cash_out' | 'paid_in' | 'paid_out';
  amount: number;
  reason: string;
  created_at: string;
  user?: { name: string };
}

/**
 * The backend Shift model has NO `status` column — open vs closed is
 * derived from `closed_at` being null. The UI used to do
 * `shift.status === 'closed'` which always evaluated false against the
 * raw API response, so a freshly-closed shift looked permanently
 * open and the cashier could not start a new one. `status` is kept
 * here as an optional/derived convenience but the UI should rely on
 * `closed_at` for state checks.
 */
export interface Shift {
  id: number;
  status?: 'open' | 'closed';
  opening_cash: number;
  closing_cash: number | null;
  total_cash_in: number;
  total_cash_out: number;
  expected_cash: number | null;
  variance: number | null;
  notes: string | null;
  opened_at: string;
  closed_at: string | null;
  opened_by: string | null;
  closed_by: string | null;
  cash_movements: CashMovement[];
}

export async function getCurrentShift(): Promise<{ shift: Shift | null }> {
  return req('/shifts/current');
}

export async function openShift(data: { opening_cash: number }): Promise<{ shift: Shift }> {
  return req('/shifts/open', { method: 'POST', body: JSON.stringify(data) });
}

export async function closeShift(id: number, data: { closing_cash: number; notes?: string }): Promise<{ shift: Shift }> {
  return req(`/shifts/${id}/close`, { method: 'POST', body: JSON.stringify(data) });
}

export async function addCashMovement(
  shiftId: number,
  data: { type: 'cash_in' | 'cash_out' | 'paid_in' | 'paid_out'; amount: number; reason: string },
): Promise<{ movement: CashMovement }> {
  return req(`/shifts/${shiftId}/cash-movements`, { method: 'POST', body: JSON.stringify(data) });
}

// ── Devices ───────────────────────────────────────────────────────────────────

export interface Device {
  id: number;
  name: string;
  identifier?: string;
  type: 'pos' | 'kds' | 'display' | string;
  token: string | null;
  is_active: boolean;
  status: 'pending' | 'approved' | 'rejected';
  last_seen_at: string | null;
  registered_by?: string | null;
  open_shift_id?: number | null;
  user?: { id: number; name: string } | null;
  created_at: string;
}

export async function fetchDevices(): Promise<{ data: Device[] }> {
  return req('/devices');
}

export async function fetchPendingDevices(): Promise<{ devices: Device[] }> {
  return req('/devices/pending');
}

export async function registerDevice(
  data: { name: string; type: string; identifier?: string },
): Promise<{ device: Device; identifier: string }> {
  return req('/devices/register', { method: 'POST', body: JSON.stringify(data) });
}

export async function disableDevice(id: number): Promise<{ device: Device }> {
  return req(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) });
}

export async function enableDevice(id: number): Promise<{ device: Device }> {
  return req(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify({ is_active: true }) });
}

export async function approveDevice(id: number, name?: string): Promise<{ device: Device }> {
  return req(`/devices/${id}/approve`, { method: 'PATCH', body: JSON.stringify({ name }) });
}

export async function rejectDevice(id: number): Promise<{ device: Device }> {
  return req(`/devices/${id}/reject`, { method: 'PATCH' });
}

export async function deleteDevice(id: number): Promise<void> {
  return req(`/devices/${id}`, { method: 'DELETE' });
}

// ── Waste Logs ────────────────────────────────────────────────────────────────

export interface WasteLog {
  id: number;
  item: { id: number; name: string } | null;
  inventory_item: { id: number; name: string } | null;
  quantity: number;
  unit: string | null;
  cost_estimate: number | null;
  reason: string;
  notes: string | null;
  logged_by: string | null;
  created_at: string;
}

export async function fetchWasteLogs(params?: { from?: string; to?: string; page?: number; per_page?: number }): Promise<{ data: WasteLog[]; meta: { current_page: number; last_page: number; total: number }; total_cost: number }> {
  const qs = new URLSearchParams();
  if (params?.from)     qs.set('from',     params.from);
  if (params?.to)       qs.set('to',       params.to);
  if (params?.page)     qs.set('page',     String(params.page));
  if (params?.per_page) qs.set('per_page', String(params.per_page));
  return req(`/waste-logs?${qs}`);
}

export async function createWasteLog(data: { item_id?: number; inventory_item_id?: number; quantity: number; unit?: string; cost_estimate?: number; reason: string; notes?: string }): Promise<{ waste_log: WasteLog }> {
  return req('/waste-logs', { method: 'POST', body: JSON.stringify(data) });
}

export interface WasteSummary {
  from: string | null;
  to: string | null;
  total_cost: number;
  total_entries: number;
  by_reason: Array<{ reason: string; entries: number; cost: number }>;
  daily_trend: Array<{ date: string; cost: number }>;
  top_items: Array<{ key: string; name: string; entries: number; cost: number }>;
}

export async function fetchWasteSummary(params: { from: string; to: string }): Promise<WasteSummary> {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  return req(`/waste-logs/summary?${qs}`);
}

// ── Print Jobs ────────────────────────────────────────────────────────────────

/**
 * UI-facing print job shape. Backend `PrintJob` model uses
 * `last_error` and `attempts`; we expose them as `error_message` and
 * `retry_count` (the UI's vocabulary) via the mapper below. The
 * controller also wraps the paginator as `{ jobs: {...} }` not
 * `{ data: [...] }`, which is why the Print Queue page used to render
 * permanently empty even when jobs existed.
 */
export interface PrintJob {
  id: number;
  order_id: number | null;
  order_number: string | null;
  type: string;
  status: 'queued' | 'pending' | 'printed' | 'failed' | string;
  printer_name: string | null;
  copies: number;
  payload: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  printed_at: string | null;
  retry_count: number;
}

type BackendPrintJobRow = {
  id: number;
  order_id?: number | null;
  order?: { id?: number; order_number?: string | null } | null;
  type: string;
  status: string;
  printer?: { name?: string | null } | null;
  printer_name?: string | null;
  attempts?: number | null;
  last_error?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
  printed_at?: string | null;
  copies?: number | null;
};

function mapPrintJob(row: BackendPrintJobRow): PrintJob {
  return {
    id: row.id,
    order_id: row.order_id ?? row.order?.id ?? null,
    order_number: row.order?.order_number ?? null,
    type: row.type,
    status: row.status as PrintJob['status'],
    printer_name: row.printer?.name ?? row.printer_name ?? null,
    copies: row.copies ?? 1,
    payload: row.payload ?? {},
    error_message: row.last_error ?? null,
    created_at: row.created_at,
    printed_at: row.printed_at ?? null,
    retry_count: row.attempts ?? 0,
  };
}

export async function fetchPrintJobs(params?: {
  status?: string;
  page?: number;
}): Promise<{ data: PrintJob[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.page)   qs.set('page', String(params.page));
  const res = await req<{
    jobs: {
      data: BackendPrintJobRow[];
      current_page: number;
      last_page: number;
      total: number;
    };
  }>(`/print-jobs?${qs}`);
  return {
    data: (res.jobs?.data ?? []).map(mapPrintJob),
    meta: {
      current_page: res.jobs?.current_page ?? 1,
      last_page:    res.jobs?.last_page ?? 1,
      total:        res.jobs?.total ?? 0,
    },
  };
}

export async function retryPrintJob(id: number): Promise<{ print_job: PrintJob }> {
  // Controller returns `{ job: <PrintJob model> }` — wrap and rename
  // to the {print_job} shape the callers were already using.
  const res = await req<{ job: BackendPrintJobRow }>(`/print-jobs/${id}/retry`, { method: 'POST' });
  return { print_job: mapPrintJob(res.job) };
}

export interface UnitConversion {
  id: number;
  from_unit: string;
  to_unit: string;
  factor: number;
}

export async function getUnitConversions(): Promise<{ conversions: UnitConversion[] }> {
  return req('/unit-conversions');
}

export async function createUnitConversion(data: { from_unit: string; to_unit: string; factor: number }): Promise<{ conversion: UnitConversion }> {
  return req('/unit-conversions', { method: 'POST', body: JSON.stringify(data) });
}

export async function deleteUnitConversion(id: number): Promise<void> {
  await req(`/unit-conversions/${id}`, { method: 'DELETE' });
}

// ── Inventory price history & cheapest supplier ───────────────────────────────

export interface InventoryPriceHistoryEntry {
  purchase_id: number | null;
  purchase_number?: string | null;
  supplier: string | null;
  unit_cost: number;
  quantity: number;
  purchase_date: string | null;
}

export async function getInventoryPriceHistory(id: number): Promise<{ history: InventoryPriceHistoryEntry[] }> {
  return req(`/inventory/${id}/price-history`);
}

export interface CheapestSupplier {
  id: number;
  name: string;
  min_cost: number;
}

export async function getInventoryCheapestSupplier(id: number): Promise<{ supplier: CheapestSupplier | null }> {
  return req(`/inventory/${id}/cheapest-supplier`);
}

// ── Stock count ───────────────────────────────────────────────────────────────

export interface StockCountEntry {
  inventory_item_id: number;
  quantity: number;
  notes?: string;
}

export async function submitStockCount(counts: StockCountEntry[]): Promise<{ adjustments: { item_id: number; difference: number; balance_after: number }[] }> {
  return req('/inventory/stock-count', { method: 'POST', body: JSON.stringify({ counts }) });
}

export async function createInventoryItem(data: {
  name: string;
  unit: string;
  sku?: string;
  current_stock?: number;
  reorder_point?: number;
  lead_days?: number | null;
  cover_days?: number | null;
  unit_cost?: number;
  is_active?: boolean;
  inventory_category_id?: number;
  preferred_supplier_id?: number;
  storage_location?: string;
  notes?: string;
}): Promise<{ item: InventoryItem }> {
  const res = await req<{ item: BackendInventoryRow }>('/inventory', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return { item: mapInventoryRow(res.item) };
}

export async function updateInventoryItem(
  id: number,
  data: Partial<{
    name: string;
    unit: string;
    sku: string | null;
    reorder_point: number | null;
    lead_days: number | null;
    cover_days: number | null;
    unit_cost: number | null;
    inventory_category_id: number | null;
    preferred_supplier_id: number | null;
    storage_location: string | null;
    notes: string | null;
    is_active: boolean;
  }>,
): Promise<{ item: InventoryItem }> {
  const res = await req<{ item: BackendInventoryRow }>(`/inventory/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return { item: mapInventoryRow(res.item) };
}

export async function resolveReorderAlert(id: number): Promise<{ message: string }> {
  return req(`/inventory/reorder-alerts/${id}/resolve`, { method: 'POST' });
}

export type StockMovementRow = {
  id: number;
  type: string;
  quantity: number;
  balance_after: number | null;
  unit_cost: number | null;
  reference_type: string | null;
  reference_id: number | null;
  notes: string | null;
  created_at: string;
  user?: { id: number; name: string } | null;
};

export async function fetchInventoryItemDetail(
  id: number,
  params?: { page?: number; per_page?: number },
): Promise<{
  item: InventoryItem;
  movements: { data: StockMovementRow[]; current_page: number; last_page: number; total: number };
}> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.per_page) qs.set('per_page', String(params.per_page));
  const res = await req<{
    item: BackendInventoryRow;
    movements: { data: StockMovementRow[]; current_page: number; last_page: number; total: number };
  }>(`/inventory/${id}?${qs}`);
  return {
    item: mapInventoryRow(res.item),
    movements: res.movements ?? { data: [], current_page: 1, last_page: 1, total: 0 },
  };
}

// ── Prepared stock (menu items) ───────────────────────────────────────────────

export interface PreparedStockRow {
  item_id: number;
  variant_id: number | null;
  name: string;
  stock: number;
  low_stock_threshold: number;
}

export async function fetchPreparedStock(): Promise<{ items: PreparedStockRow[] }> {
  return req('/prepared-stock');
}

export async function adjustPreparedStock(
  itemId: number,
  data: { delta: number; variant_id?: number | null; notes?: string },
): Promise<{ message: string; item: PreparedStockRow }> {
  return req(`/items/${itemId}/prepared-stock/adjust`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── Suppliers CRUD ────────────────────────────────────────────────────────────

export interface Supplier {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
  created_at?: string;
}

export async function fetchSuppliers(params?: { search?: string; active_only?: boolean; page?: number }): Promise<{
  data: Supplier[];
  meta: { current_page: number; last_page: number; total: number };
}> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.active_only) qs.set('active_only', '1');
  if (params?.page) qs.set('page', String(params.page));
  const res = await req<{ suppliers: { data: Supplier[]; current_page: number; last_page: number; total: number } }>(
    `/suppliers?${qs}`,
  );
  return {
    data: res.suppliers?.data ?? [],
    meta: {
      current_page: res.suppliers?.current_page ?? 1,
      last_page: res.suppliers?.last_page ?? 1,
      total: res.suppliers?.total ?? 0,
    },
  };
}

export async function createSupplier(data: {
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
}): Promise<{ supplier: Supplier }> {
  return req('/suppliers', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSupplier(id: number, data: Partial<{
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  is_active: boolean;
}>): Promise<{ supplier: Supplier }> {
  return req(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteSupplier(id: number): Promise<void> {
  await req(`/suppliers/${id}`, { method: 'DELETE' });
}
