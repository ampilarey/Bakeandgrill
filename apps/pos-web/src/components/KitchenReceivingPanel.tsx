import { useCallback, useEffect, useState } from "react";
import {
  fetchKitchenReceivingPending,
  receiveKitchenBatchAll,
  type KitchenProductionBatch,
} from "../api";
import { EmptyState, PanelShell } from "./OpenTicketsPanel";

type Props = {
  onClose: () => void;
  onReceived?: () => void;
};

export function KitchenReceivingPanel({ onClose, onReceived }: Props) {
  const [batches, setBatches] = useState<KitchenProductionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchKitchenReceivingPending();
      setBatches(res.data ?? []);
      setMsg(null);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message || "Couldn't load queue" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleReceiveAll = async (batchId: number) => {
    setBusyId(batchId);
    setMsg(null);
    try {
      await receiveKitchenBatchAll(batchId);
      setMsg({ kind: "ok", text: "Received from kitchen." });
      onReceived?.();
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message || "Receive failed" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PanelShell title="Kitchen receiving" onClose={onClose}>
      {msg && (
        <div style={{
          marginBottom: 12,
          padding: 10,
          borderRadius: 8,
          fontSize: 13,
          background: msg.kind === "ok" ? "#ECFDF5" : "#FEE2E2",
          color: msg.kind === "ok" ? "#047857" : "#991B1B",
        }}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <p style={{ color: "#8B7355" }}>Loading…</p>
      ) : batches.length === 0 ? (
        <EmptyState emoji="🍳" title="Nothing waiting" body="Kitchen batches appear here when submitted." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {batches.map((batch) => (
            <div
              key={batch.id}
              style={{
                border: "1px solid #EDE4D4",
                borderRadius: 10,
                padding: 12,
                background: "#FFFDF9",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{batch.batch_no}</div>
                  <div style={{ fontSize: 12, color: "#8B7355" }}>
                    {batch.production_type.replace("_", " ")}
                    {batch.order?.order_number ? ` · Order ${batch.order.order_number}` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#B45309", background: "#FFFBEB", padding: "2px 8px", borderRadius: 999 }}>
                  {batch.status}
                </span>
              </div>
              <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 13 }}>
                {batch.items.map((item) => (
                  <li key={item.id}>
                    {item.name} — {item.produced_qty} {item.unit}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={busyId === batch.id}
                onClick={() => void handleReceiveAll(batch.id)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "#047857",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {busyId === batch.id ? "Receiving…" : "Receive all"}
              </button>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}
