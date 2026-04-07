import { req } from './client';

// ── Inventory ─────────────────────────────────────────────────────────────────

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

export async function fetchInventoryItems(params?: {
  search?: string; category_id?: number; low_stock?: boolean; page?: number;
}): Promise<{ data: InventoryItem[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.search)      qs.set('search',      params.search);
  if (params?.category_id) qs.set('category_id', String(params.category_id));
  if (params?.low_stock)   qs.set('low_stock',   '1');
  if (params?.page)        qs.set('page',        String(params.page));
  return req(`/inventory?${qs}`);
}

export async function fetchLowStockItems(): Promise<{ data: InventoryItem[] }> {
  return req('/inventory/low-stock');
}

export async function adjustInventoryStock(
  id: number,
  data: { type: 'add' | 'remove' | 'set'; quantity: number; reason?: string },
): Promise<{ item: InventoryItem }> {
  return req(`/inventory/${id}/adjust`, { method: 'POST', body: JSON.stringify(data) });
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

export interface RestaurantTable {
  id: number;
  number: string;
  capacity: number;
  zone: string | null;
  status: 'available' | 'occupied' | 'reserved' | 'closed';
  current_order_id: number | null;
  is_active: boolean;
}

export async function fetchTables(): Promise<{ data: RestaurantTable[] }> {
  return req('/tables');
}

export async function createTable(data: { number: string; capacity: number; zone?: string }): Promise<{ table: RestaurantTable }> {
  return req('/tables', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTable(id: number, data: Partial<{ number: string; capacity: number; zone: string; is_active: boolean }>): Promise<{ table: RestaurantTable }> {
  return req(`/tables/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function openTable(id: number): Promise<{ table: RestaurantTable }> {
  return req(`/tables/${id}/open`, { method: 'POST' });
}

export async function closeTable(id: number): Promise<{ table: RestaurantTable }> {
  return req(`/tables/${id}/close`, { method: 'POST' });
}

export async function mergeTables(tableIds: number[]): Promise<{ table: RestaurantTable }> {
  return req('/tables/merge', { method: 'POST', body: JSON.stringify({ table_ids: tableIds }) });
}

export async function splitTable(id: number, into: number): Promise<{ tables: RestaurantTable[] }> {
  return req(`/tables/${id}/split`, { method: 'POST', body: JSON.stringify({ into }) });
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

export interface Shift {
  id: number;
  status: 'open' | 'closed';
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
  type: 'pos' | 'kds' | 'display' | string;
  token: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  registered_by: string | null;
  created_at: string;
}

export async function fetchDevices(): Promise<{ data: Device[] }> {
  return req('/devices');
}

export async function registerDevice(data: { name: string; type: string }): Promise<{ device: Device; token: string }> {
  return req('/devices/register', { method: 'POST', body: JSON.stringify(data) });
}

export async function disableDevice(id: number): Promise<{ device: Device }> {
  return req(`/devices/${id}/disable`, { method: 'PATCH' });
}

export async function enableDevice(id: number): Promise<{ device: Device }> {
  return req(`/devices/${id}/enable`, { method: 'PATCH' });
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

export async function fetchWasteLogs(params?: { from?: string; to?: string; page?: number }): Promise<{ data: WasteLog[]; meta: { current_page: number; last_page: number; total: number }; total_cost: number }> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to)   qs.set('to', params.to);
  if (params?.page) qs.set('page', String(params.page));
  return req(`/waste-logs?${qs}`);
}

export async function createWasteLog(data: { item_id?: number; inventory_item_id?: number; quantity: number; unit?: string; cost_estimate?: number; reason: string; notes?: string }): Promise<{ waste_log: WasteLog }> {
  return req('/waste-logs', { method: 'POST', body: JSON.stringify(data) });
}

// ── Print Jobs ────────────────────────────────────────────────────────────────

export interface PrintJob {
  id: number;
  type: string;
  status: 'pending' | 'printed' | 'failed';
  printer_name: string | null;
  copies: number;
  payload: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  printed_at: string | null;
  retry_count: number;
}

export async function fetchPrintJobs(params?: {
  status?: string;
  page?: number;
}): Promise<{ data: PrintJob[]; meta: { current_page: number; last_page: number; total: number } }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.page)   qs.set('page', String(params.page));
  return req(`/print-jobs?${qs}`);
}

export async function retryPrintJob(id: number): Promise<{ print_job: PrintJob }> {
  return req(`/print-jobs/${id}/retry`, { method: 'POST' });
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
  purchase_id: number;
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
