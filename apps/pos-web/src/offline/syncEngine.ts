import { syncOfflineOrders, type PosOfflineSyncPayload } from "../api";
import {
  getPendingOfflineOrders,
  updateOfflineOrder,
  updateSyncLog,
  type OfflineOrderRecord,
} from "./db";

const BATCH_SIZE = 20;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

let syncing = false;
let backoffMs = 0;
let lastSyncAt = 0;

export type SyncEngineResult = {
  synced: number;
  failed: number;
  conflicts: number;
  remaining: number;
};

function toApiPayload(orders: OfflineOrderRecord[]): PosOfflineSyncPayload["orders"] {
  return orders.map((o) => ({
    idempotency_key: o.local_order_id,
    local_order_id: o.local_order_id,
    local_order_number: o.local_order_number,
    device_identifier: o.device_identifier,
    shift_id: o.shift_id,
    created_at_local: o.created_at_local,
    type: o.type,
    items: o.items.map((it) => ({
      item_id: it.item_id,
      quantity: it.quantity,
      ...(it.variant_id != null ? { variant_id: it.variant_id } : {}),
      unit_price: it.unit_price,
      ...(it.modifiers ? { modifiers: it.modifiers } : {}),
      ...(it.notes ? { notes: it.notes } : {}),
    })),
    totals: o.totals,
    payment: {
      method: o.payment.method,
      amount: o.payment.amount,
      ...(o.payment.reference ? { reference: o.payment.reference } : {}),
    },
    ...(o.discount_amount != null ? { discount_amount: o.discount_amount } : {}),
    ...(o.customer_id != null ? { customer_id: o.customer_id } : {}),
    ...(o.ticket_name ? { ticket_name: o.ticket_name } : {}),
    ...(o.ticket_note ? { ticket_note: o.ticket_note } : {}),
    ...(o.restaurant_table_id != null ? { restaurant_table_id: o.restaurant_table_id } : {}),
    ...(o.rewards ? { rewards: o.rewards } : {}),
    prepared_locally: true,
  }));
}

export async function runOfflineSync(force = false): Promise<SyncEngineResult> {
  if (syncing) {
    return { synced: 0, failed: 0, conflicts: 0, remaining: (await getPendingOfflineOrders()).length };
  }

  const now = Date.now();
  if (!force && backoffMs > 0 && now - lastSyncAt < backoffMs) {
    return { synced: 0, failed: 0, conflicts: 0, remaining: (await getPendingOfflineOrders()).length };
  }

  syncing = true;
  lastSyncAt = now;

  let synced = 0;
  let failed = 0;
  let conflicts = 0;

  try {
    await updateSyncLog({ last_attempt_at: new Date().toISOString(), last_error: null });

    const pending = await getPendingOfflineOrders();
    if (pending.length === 0) {
      await updateSyncLog({ pending_count: 0 });
      return { synced: 0, failed: 0, conflicts: 0, remaining: 0 };
    }

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      for (const order of batch) {
        await updateOfflineOrder(order.local_order_id, { status: "syncing" });
      }

      try {
        const response = await syncOfflineOrders({ orders: toApiPayload(batch) });

        for (const result of response.results) {
          const order = batch.find((b) => b.local_order_id === result.local_order_id);
          if (!order) continue;

          if (result.status === "synced") {
            synced += 1;
            await updateOfflineOrder(order.local_order_id, {
              status: "synced",
              server_order_id: result.server_order_id,
              server_order_number: result.server_order_number,
              inventory_conflict: result.inventory_conflict,
              synced_at: new Date().toISOString(),
              last_error: undefined,
            });
          } else if (result.status === "conflict") {
            conflicts += 1;
            await updateOfflineOrder(order.local_order_id, {
              status: "conflict",
              last_error: result.message ?? "Sync conflict",
            });
          } else {
            failed += 1;
            await updateOfflineOrder(order.local_order_id, {
              status: "failed",
              last_error: result.message ?? "Sync failed",
            });
          }
        }
      } catch (e) {
        failed += batch.length;
        const msg = e instanceof Error ? e.message : "Network error during sync";
        for (const order of batch) {
          await updateOfflineOrder(order.local_order_id, { status: "failed", last_error: msg });
        }
        backoffMs = Math.min(MAX_BACKOFF_MS, Math.max(30_000, backoffMs * 2 || 30_000));
        await updateSyncLog({ last_error: msg });
        break;
      }
    }

    backoffMs = 0;
    const remaining = (await getPendingOfflineOrders()).length;
    await updateSyncLog({
      last_success_at: synced > 0 ? new Date().toISOString() : undefined,
      pending_count: remaining,
      synced_count: synced,
      failed_count: failed + conflicts,
      last_error: failed + conflicts > 0 ? `${failed} failed, ${conflicts} conflicts` : null,
    });

    return { synced, failed, conflicts, remaining };
  } finally {
    syncing = false;
  }
}

export function isSyncEngineRunning(): boolean {
  return syncing;
}

export function startSyncEnginePolling(isReachable: () => boolean): () => void {
  const onOnline = () => { if (isReachable()) void runOfflineSync(); };
  const onVisible = () => {
    if (document.visibilityState === "visible" && isReachable()) void runOfflineSync();
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);

  const interval = window.setInterval(() => {
    if (isReachable() && document.visibilityState === "visible") {
      void runOfflineSync();
    }
  }, 60_000);

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(interval);
  };
}
