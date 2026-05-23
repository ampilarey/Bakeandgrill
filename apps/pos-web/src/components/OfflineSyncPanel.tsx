import { useCallback, useEffect, useState } from "react";
import {
  countPendingOfflineOrders,
  getSyncLog,
  type SyncLogRecord,
} from "../offline/db";
import { runOfflineSync } from "../offline/syncEngine";

type Props = {
  shiftId: number | null;
  onClose: () => void;
};

export function OfflineSyncPanel({ shiftId, onClose }: Props) {
  const [pending, setPending] = useState(0);
  const [log, setLog] = useState<SyncLogRecord | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const count = await countPendingOfflineOrders(shiftId ?? undefined);
    const syncLog = await getSyncLog();
    setPending(count);
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

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 850, background: "rgba(15,23,42,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        width: "min(420px, 100%)", background: "#fff", borderRadius: 12,
        padding: 20, boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Sync status</h2>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
          <div><strong>Pending:</strong> {pending}</div>
          <div><strong>Last sync:</strong> {log?.last_success_at ? new Date(log.last_success_at).toLocaleString() : "Never"}</div>
          {log?.last_error && (
            <div style={{ color: "#b91c1c", fontSize: 13 }}>{log.last_error}</div>
          )}
        </div>

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
    </div>
  );
}
