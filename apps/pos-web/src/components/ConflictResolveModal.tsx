import type { OfflineOrderRecord } from "../offline/db";

type Props = {
  order: OfflineOrderRecord;
  busy: boolean;
  onRetry: () => void;
  onDiscard: () => void;
  onClose: () => void;
};

export function ConflictResolveModal({ order, busy, onRetry, onDiscard, onClose }: Props) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 900, background: "rgba(15,23,42,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        width: "min(520px, 100%)", maxHeight: "min(90vh, 680px)", overflow: "auto",
        background: "#fff", borderRadius: 12, padding: 20,
        boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Resolve sync conflict</h2>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>

        <p style={{ margin: "0 0 12px", fontSize: 14, color: "#475569", lineHeight: 1.5 }}>
          {order.inventory_conflict
            ? "This order could not sync because prepared stock ran out while you were offline. Retry after restocking, or discard this local copy."
            : "The server rejected this offline order — it may already exist or totals changed. Compare the details below, then retry or discard the local copy."}
        </p>

        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{order.local_order_number}</div>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
            MVR {order.payment.amount.toFixed(2)} · {order.items.length} item{order.items.length === 1 ? "" : "s"}
          </div>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#334155", lineHeight: 1.5, fontSize: 13 }}>
            {order.items.map((line, idx) => (
              <li key={`${line.item_id}-${idx}`}>
                {line.quantity}× {line.name ?? `Item #${line.item_id}`}
              </li>
            ))}
          </ul>
          {order.last_error && (
            <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 12, lineHeight: 1.4 }}>
              Server message: {order.last_error}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={busy}
            onClick={onRetry}
            style={{
              flex: 1, minHeight: 44, borderRadius: 8, border: "none",
              background: "#0f172a", color: "#fff", fontWeight: 700, cursor: "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            Retry sync
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDiscard}
            style={{
              flex: 1, minHeight: 44, borderRadius: 8,
              border: "1px solid #fecaca", background: "#fff", color: "#b91c1c",
              fontWeight: 700, cursor: "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            Discard local copy
          </button>
        </div>
      </div>
    </div>
  );
}
