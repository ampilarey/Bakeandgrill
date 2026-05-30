import { useCallback, useEffect, useState } from "react";
import {
  countPendingOfflineOrders,
  deleteOfflineOrder,
  getConflictOfflineOrders,
  getSyncLog,
  retryOfflineOrder,
  type OfflineOrderRecord,
  type SyncLogRecord,
} from "../offline/db";
import { runOfflineSync } from "../offline/syncEngine";
import { ConflictResolveModal } from "./ConflictResolveModal";

type Props = {
  shiftId: number | null;
  onClose: () => void;
};

export function OfflineSyncPanel({ shiftId, onClose }: Props) {
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState<OfflineOrderRecord[]>([]);
  const [log, setLog] = useState<SyncLogRecord | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<OfflineOrderRecord | null>(null);

  const refresh = useCallback(async () => {
    const count = await countPendingOfflineOrders(shiftId ?? undefined);
    const conflictRows = await getConflictOfflineOrders(shiftId ?? undefined);
    const syncLog = await getSyncLog();
    setPending(count);
    setConflicts(conflictRows);
    setLog(syncLog);
  }, [shiftId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const syncNow = async () => {
    setSyncing(true);
    setMessage("");
    try {
      const result = await runOfflineSync(true);
      await refresh();
      if (result.remaining === 0 && result.synced > 0) {
        setMessage(`Synced ${result.synced} order${result.synced === 1 ? "" : "s"}.`);
      } else if (result.synced > 0) {
        setMessage(`Synced ${result.synced}, ${result.remaining} remaining.`);
      } else if (result.failed + result.conflicts > 0) {
        setMessage(`${result.failed} failed, ${result.conflicts} conflicts.`);
      } else {
        setMessage("Nothing to sync.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const handleRetry = async (order: OfflineOrderRecord) => {
    setResolvingId(order.local_order_id);
    setMessage("");
    try {
      await retryOfflineOrder(order.local_order_id);
      const result = await runOfflineSync(true);
      await refresh();
      if (result.synced > 0) {
        setMessage(`Retried and synced ${order.local_order_number}.`);
      } else {
        setMessage(`Retried ${order.local_order_number} — still pending or conflict.`);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Retry failed.");
    } finally {
      setResolvingId(null);
    }
  };

  const handleDiscard = async (order: OfflineOrderRecord) => {
    if (!window.confirm(`Discard offline order ${order.local_order_number}? This cannot be undone.`)) {
      return;
    }
    setResolvingId(order.local_order_id);
    setMessage("");
    try {
      await deleteOfflineOrder(order.local_order_id);
      await refresh();
      setMessage(`Discarded ${order.local_order_number}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Discard failed.");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 850, background: "rgba(15,23,42,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        width: "min(480px, 100%)", maxHeight: "min(90vh, 640px)", overflow: "auto",
        background: "#fff", borderRadius: 12,
        padding: 20, boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Sync status</h2>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
          <div><strong>Pending:</strong> {pending}</div>
          <div><strong>Conflicts:</strong> {conflicts.length}</div>
          <div><strong>Last sync:</strong> {log?.last_success_at ? new Date(log.last_success_at).toLocaleString() : "Never"}</div>
          {log?.last_error && (
            <div style={{ color: "#b91c1c", fontSize: 13 }}>{log.last_error}</div>
          )}
        </div>

        {conflicts.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "#0f172a" }}>Conflicts — resolve manually</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {conflicts.map((order) => {
                const busy = resolvingId === order.local_order_id;
                return (
                  <div
                    key={order.local_order_id}
                    style={{
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{order.local_order_number}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                      {order.inventory_conflict && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: "#92400e", background: "#fef3c7",
                          border: "1px solid #fcd34d", borderRadius: 999, padding: "2px 8px",
                        }}>
                          Inventory conflict
                        </span>
                      )}
                      <span style={{ color: "#64748b", fontSize: 13 }}>
                        MVR {order.payment.amount.toFixed(2)} · {order.items.length} items
                      </span>
                    </div>
                    <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#334155", lineHeight: 1.5 }}>
                      {order.items.map((line, idx) => (
                        <li key={`${line.item_id}-${idx}`}>
                          {line.quantity}× {line.name ?? `Item #${line.item_id}`}
                          {line.modifiers?.length ? ` (+${line.modifiers.length} mods)` : ""}
                        </li>
                      ))}
                    </ul>
                    {order.last_error && (
                      <div style={{ color: "#b91c1c", marginTop: 6, lineHeight: 1.4 }}>{order.last_error}</div>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setDetailOrder(order)}
                        style={{
                          minHeight: 36, padding: "0 12px", borderRadius: 8,
                          border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a",
                          fontWeight: 600, cursor: "pointer",
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        View details
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleRetry(order)}
                        style={{
                          minHeight: 36, padding: "0 12px", borderRadius: 8, border: "none",
                          background: "#0f172a", color: "#fff", fontWeight: 600, cursor: "pointer",
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        Retry sync
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDiscard(order)}
                        style={{
                          minHeight: 36, padding: "0 12px", borderRadius: 8,
                          border: "1px solid #fecaca", background: "#fff", color: "#b91c1c",
                          fontWeight: 600, cursor: "pointer",
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {message && (
          <div style={{ marginTop: 12, padding: 10, background: "#f1f5f9", borderRadius: 8, fontSize: 13 }}>
            {message}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            disabled={syncing || pending === 0}
            onClick={() => void syncNow()}
            style={{
              flex: 1, minHeight: 44, borderRadius: 8, border: "none",
              background: "#0f172a", color: "#fff", fontWeight: 700, cursor: "pointer",
              opacity: syncing || pending === 0 ? 0.5 : 1,
            }}
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight: 44, padding: "0 16px", borderRadius: 8,
              border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>

      {detailOrder && (
        <ConflictResolveModal
          order={detailOrder}
          busy={resolvingId === detailOrder.local_order_id}
          onClose={() => setDetailOrder(null)}
          onRetry={() => {
            void handleRetry(detailOrder).then(() => setDetailOrder(null));
          }}
          onDiscard={() => {
            void handleDiscard(detailOrder).then(() => setDetailOrder(null));
          }}
        />
      )}
    </div>
  );
}
