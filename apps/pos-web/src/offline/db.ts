import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type OfflineOrderStatus = "pending_sync" | "syncing" | "synced" | "failed" | "conflict";

export type OfflineOrderRecord = {
  local_order_id: string;
  local_order_number: string;
  device_identifier: string;
  shift_id: number;
  created_at_local: string;
  type: string;
  items: Array<{
    item_id: number;
    quantity: number;
    variant_id?: number;
    unit_price: number;
    name?: string;
    modifiers?: Array<{ modifier_id: number; name?: string; price?: number }>;
    notes?: string;
  }>;
  totals: { subtotal: number; tax: number; total: number };
  payment: {
    method: "cash" | "card" | "qr" | "bank_transfer";
    amount: number;
    reference?: string;
    change_given?: number;
  };
  discount_amount?: number;
  customer_id?: number;
  rewards?: {
    promo_code?: string | null;
    loyalty_points?: number;
    gift_card_code?: string | null;
  };
  ticket_name?: string;
  ticket_note?: string;
  restaurant_table_id?: number;
  status: OfflineOrderStatus;
  server_order_id?: number;
  server_order_number?: string;
  last_error?: string;
  inventory_conflict?: boolean;
  synced_at?: string;
};

export type CachedMenuRecord = {
  id: string;
  channel: string;
  categories: unknown[];
  items: unknown[];
  tax_rate?: number;
  cached_at: string;
};

export type CachedStaffSession = {
  id: "current";
  staff_user_id: number;
  name: string;
  permissions: string[];
  cached_at: string;
};

export type CachedShiftRecord = {
  id: "current";
  shift_id: number;
  staff_user_id: number | null;
  opened_at: string;
  device_identifier: string;
  cached_at: string;
};

export type SyncLogRecord = {
  id: "latest";
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  pending_count: number;
  synced_count: number;
  failed_count: number;
};

interface PosOfflineDB extends DBSchema {
  cached_menu: { key: string; value: CachedMenuRecord };
  cached_staff_session: { key: string; value: CachedStaffSession };
  cached_shift: { key: string; value: CachedShiftRecord };
  offline_orders: { key: string; value: OfflineOrderRecord; indexes: { status: string; shift_id: number } };
  sync_logs: { key: string; value: SyncLogRecord };
  meta: { key: string; value: { value: string | number } };
}

const DB_NAME = "pos_offline_v1";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<PosOfflineDB>> | null = null;

export function getOfflineDb(): Promise<IDBPDatabase<PosOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PosOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("cached_menu")) {
          db.createObjectStore("cached_menu");
        }
        if (!db.objectStoreNames.contains("cached_staff_session")) {
          db.createObjectStore("cached_staff_session");
        }
        if (!db.objectStoreNames.contains("cached_shift")) {
          db.createObjectStore("cached_shift");
        }
        if (!db.objectStoreNames.contains("offline_orders")) {
          const store = db.createObjectStore("offline_orders", { keyPath: "local_order_id" });
          store.createIndex("status", "status");
          store.createIndex("shift_id", "shift_id");
        }
        if (!db.objectStoreNames.contains("sync_logs")) {
          db.createObjectStore("sync_logs");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
      },
    });
  }
  return dbPromise;
}

export const MAX_OFFLINE_ORDERS = 100;

export async function initOfflineDb(): Promise<void> {
  await getOfflineDb();
  await importLegacyLocalStorageQueue();
}

export async function saveCachedMenu(
  channel: string,
  data: Omit<CachedMenuRecord, "id" | "channel" | "cached_at">,
): Promise<void> {
  const db = await getOfflineDb();
  const id = `channel:${channel}`;
  await db.put(
    "cached_menu",
    {
      id,
      channel,
      ...data,
      cached_at: new Date().toISOString(),
    },
    id,
  );
}

export async function loadCachedMenu(channel?: string): Promise<CachedMenuRecord | null> {
  const db = await getOfflineDb();
  if (channel) {
    return (await db.get("cached_menu", `channel:${channel}`)) ?? null;
  }
  const all = await db.getAll("cached_menu");
  return all.sort((a, b) => b.cached_at.localeCompare(a.cached_at))[0] ?? null;
}

export async function saveCachedStaffSession(data: Omit<CachedStaffSession, "id" | "cached_at">): Promise<void> {
  const db = await getOfflineDb();
  await db.put(
    "cached_staff_session",
    {
      id: "current",
      ...data,
      cached_at: new Date().toISOString(),
    },
    "current",
  );
}

export async function loadCachedStaffSession(): Promise<CachedStaffSession | null> {
  const db = await getOfflineDb();
  return (await db.get("cached_staff_session", "current")) ?? null;
}

/** Persist staff session for offline gate — call on every successful login /auth/me. */
export async function cacheStaffSessionFromUser(user: {
  id: number;
  name: string;
  permissions?: string[];
}): Promise<void> {
  localStorage.setItem("pos_staff_user_id", String(user.id));
  await saveCachedStaffSession({
    staff_user_id: user.id,
    name: user.name,
    permissions: user.permissions ?? [],
  });
}

/**
 * Return IndexedDB session, or rebuild it from localStorage after login
 * when /auth/me has not run yet (common right before going offline).
 */
export async function ensureCachedStaffSession(): Promise<CachedStaffSession | null> {
  const existing = await loadCachedStaffSession();
  if (existing) return existing;

  const token = localStorage.getItem("pos_token");
  const userIdRaw = localStorage.getItem("pos_staff_user_id");
  const name = localStorage.getItem("pos_cashier_name");
  if (!token || !userIdRaw || !name) return null;

  const staffUserId = Number(userIdRaw);
  if (!Number.isFinite(staffUserId)) return null;

  let permissions: string[] = [];
  try {
    const raw = localStorage.getItem("pos_staff_permissions");
    permissions = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    permissions = [];
  }

  await saveCachedStaffSession({
    staff_user_id: staffUserId,
    name,
    permissions,
  });
  return loadCachedStaffSession();
}

export async function clearCachedShift(): Promise<void> {
  const db = await getOfflineDb();
  await db.delete("cached_shift", "current");
}

export async function saveCachedShift(data: Omit<CachedShiftRecord, "id" | "cached_at">): Promise<void> {
  const db = await getOfflineDb();
  await db.put(
    "cached_shift",
    {
      id: "current",
      ...data,
      cached_at: new Date().toISOString(),
    },
    "current",
  );
}

export async function loadCachedShift(): Promise<CachedShiftRecord | null> {
  const db = await getOfflineDb();
  return (await db.get("cached_shift", "current")) ?? null;
}

export async function saveOfflineOrder(order: OfflineOrderRecord): Promise<void> {
  const db = await getOfflineDb();
  await db.put("offline_orders", order);
}

export async function updateOfflineOrder(
  localOrderId: string,
  patch: Partial<OfflineOrderRecord>,
): Promise<void> {
  const db = await getOfflineDb();
  const existing = await db.get("offline_orders", localOrderId);
  if (!existing) return;
  await db.put("offline_orders", { ...existing, ...patch });
}

export async function getPendingOfflineOrders(shiftId?: number): Promise<OfflineOrderRecord[]> {
  const db = await getOfflineDb();
  const all = await db.getAllFromIndex("offline_orders", "status", "pending_sync");
  const failed = await db.getAllFromIndex("offline_orders", "status", "failed");
  const combined = [...all, ...failed];
  if (shiftId == null) return combined;
  return combined.filter((o) => o.shift_id === shiftId);
}

export async function countPendingOfflineOrders(shiftId?: number): Promise<number> {
  const orders = await getPendingOfflineOrders(shiftId);
  return orders.length;
}

export async function getConflictOfflineOrders(shiftId?: number): Promise<OfflineOrderRecord[]> {
  const db = await getOfflineDb();
  const conflicts = await db.getAllFromIndex("offline_orders", "status", "conflict");
  if (shiftId == null) return conflicts;
  return conflicts.filter((o: OfflineOrderRecord) => o.shift_id === shiftId);
}

export async function getFailedOfflineOrders(shiftId?: number): Promise<OfflineOrderRecord[]> {
  const pending = await getPendingOfflineOrders(shiftId);
  return pending.filter((o) => o.status === "failed");
}

export async function deleteOfflineOrder(localOrderId: string): Promise<void> {
  const db = await getOfflineDb();
  await db.delete("offline_orders", localOrderId);
}

export async function retryOfflineOrder(localOrderId: string): Promise<void> {
  await updateOfflineOrder(localOrderId, {
    status: "pending_sync",
    last_error: undefined,
  });
}

export async function getOfflineOrderSyncCounts(shiftId?: number): Promise<{
  pending: number;
  failed: number;
  pendingCashTotal: number;
  pendingCardTotal: number;
  pendingTransferTotal: number;
}> {
  const orders = await getPendingOfflineOrders(shiftId);
  let pendingCashTotal = 0;
  let pendingCardTotal = 0;
  let pendingTransferTotal = 0;
  let failed = 0;

  for (const o of orders) {
    if (o.status === "failed") failed += 1;
    if (o.payment.method === "cash") pendingCashTotal += o.payment.amount;
    else if (o.payment.method === "card" || o.payment.method === "qr") pendingCardTotal += o.payment.amount;
    else pendingTransferTotal += o.payment.amount;
  }

  return {
    pending: orders.length,
    failed,
    pendingCashTotal,
    pendingCardTotal,
    pendingTransferTotal,
  };
}

export async function getMetaValue(key: string): Promise<string | number | null> {
  const db = await getOfflineDb();
  const row = await db.get("meta", key);
  if (row == null) return null;
  return row.value ?? null;
}

export async function setMetaValue(key: string, value: string | number): Promise<void> {
  const db = await getOfflineDb();
  await db.put("meta", { value }, key);
}

export async function updateSyncLog(patch: Partial<SyncLogRecord>): Promise<void> {
  const db = await getOfflineDb();
  const existing = (await db.get("sync_logs", "latest")) ?? {
    id: "latest" as const,
    last_attempt_at: null,
    last_success_at: null,
    last_error: null,
    pending_count: 0,
    synced_count: 0,
    failed_count: 0,
  };
  await db.put("sync_logs", { ...existing, ...patch }, "latest");
}

export async function getSyncLog(): Promise<SyncLogRecord | null> {
  const db = await getOfflineDb();
  return (await db.get("sync_logs", "latest")) ?? null;
}

const LEGACY_QUEUE_KEY = "pos_offline_queue";

/** One-time import from localStorage queue into IndexedDB. */
export async function importLegacyLocalStorageQueue(): Promise<number> {
  const raw = localStorage.getItem(LEGACY_QUEUE_KEY);
  if (!raw) return 0;

  let imported = 0;
  try {
    const parsed = JSON.parse(raw) as Array<{ id: string; createdAt: string; payload: Record<string, unknown> }>;
    if (!Array.isArray(parsed)) return 0;

    const shift = await loadCachedShift();
    const deviceId = localStorage.getItem("pos_device_id") ?? "POS-UNKNOWN";

    for (const entry of parsed) {
      const payload = entry.payload as {
        order?: Record<string, unknown>;
        payments?: Array<{ method: string; amount: string | number }>;
      };
      const orderPayload = (payload.order ?? entry.payload) as Record<string, unknown>;
      const payments = payload.payments ?? [];
      const primary = payments[0];
      if (!primary) continue;

      const method = mapLegacyMethod(String(primary.method));
      if (!method) continue;

      const items = (orderPayload.items as OfflineOrderRecord["items"]) ?? [];
      const localId = entry.id || crypto.randomUUID();

      await saveOfflineOrder({
        local_order_id: localId,
        local_order_number: `LEGACY-${localId.slice(0, 8)}`,
        device_identifier: String(orderPayload.device_identifier ?? deviceId),
        shift_id: shift?.shift_id ?? 0,
        created_at_local: entry.createdAt,
        type: String(orderPayload.type ?? "takeaway"),
        items: items.map((it) => ({
          ...it,
          unit_price: typeof it.unit_price === "number" ? it.unit_price : 0,
        })),
        totals: { subtotal: 0, tax: 0, total: Number(primary.amount) || 0 },
        payment: {
          method,
          amount: Number(primary.amount) || 0,
        },
        status: "pending_sync",
      });
      imported += 1;
    }

    if (imported > 0) {
      localStorage.removeItem(LEGACY_QUEUE_KEY);
      console.info(`[offline] Imported ${imported} legacy queue entries into IndexedDB`);
    }
  } catch (e) {
    console.warn("[offline] Legacy queue import failed", e);
  }

  return imported;
}

function mapLegacyMethod(method: string): OfflineOrderRecord["payment"]["method"] | null {
  if (method === "cash") return "cash";
  if (method === "card" || method === "card_pos") return "card";
  if (method === "qr") return "qr";
  if (method === "digital_wallet" || method === "bank_transfer") return "bank_transfer";
  return null;
}
