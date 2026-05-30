import { useEffect, useState } from "react";
import { cancelPurchaseRequest, fetchMyPurchaseRequests, type PosPurchaseRequest } from "../api";
import { palette, radius, space, type } from "../theme";

type Props = {
  onClose: () => void;
  onRequestNew?: () => void;
};

const STATUS_LABEL: Record<string, string> = {
  requested: "Pending approval",
  approved: "Approved",
  assigned: "Assigned to buyer",
  buying: "Buying",
  partially_bought: "Partially bought",
  bought_pending_verification: "Awaiting verification",
  received: "Received",
  closed: "Closed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export function MyPurchaseRequestsPanel({ onClose, onRequestNew }: Props) {
  const [rows, setRows] = useState<PosPurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetchMyPurchaseRequests();
      setRows(res.data ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const cancel = async (id: number) => {
    try {
      await cancelPurchaseRequest(id);
      void load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div style={{ padding: space.m, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: space.m }}>
        <h2 style={{ margin: 0, fontSize: type.title.fontSize }}>My requests</h2>
        <div style={{ display: "flex", gap: space.s }}>
          {onRequestNew && (
            <button type="button" onClick={onRequestNew} style={{ padding: "8px 12px", borderRadius: radius.m, border: "none", background: "#1C1408", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
              + New request
            </button>
          )}
          <button type="button" onClick={onClose} style={{ padding: "8px 12px", borderRadius: radius.m, border: `1px solid ${palette.border}`, background: "#fff", cursor: "pointer" }}>
            Back
          </button>
        </div>
      </div>

      {err && <p style={{ color: "#ef4444" }}>{err}</p>}
      {loading ? <p>Loading…</p> : rows.length === 0 ? (
        <p style={{ color: palette.panelMuted }}>No requests yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: space.s }}>
          {rows.map((r) => (
            <div key={r.id} style={{ background: palette.panel, borderRadius: radius.m, padding: space.m, border: `1px solid ${palette.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: space.s, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{r.request_no}</div>
                  <div style={{ fontSize: type.bodySm.fontSize, color: palette.panelMuted }}>
                    {STATUS_LABEL[r.status] ?? r.status} · {r.priority}
                  </div>
                </div>
                {["requested", "approved"].includes(r.status) && (
                  <button type="button" onClick={() => void cancel(r.id)} style={{ padding: "6px 10px", borderRadius: radius.m, border: `1px solid ${palette.border}`, background: "#fff", cursor: "pointer", fontSize: type.bodySm.fontSize }}>
                    Cancel
                  </button>
                )}
              </div>
              <ul style={{ margin: `${space.s}px 0 0`, paddingLeft: 18, fontSize: type.bodySm.fontSize }}>
                {r.items.map((item) => (
                  <li key={item.id}>{item.name} — {item.requested_qty} {item.requested_unit}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
