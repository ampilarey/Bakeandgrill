import { useEffect, useState } from "react";
import {
  createPurchaseRequest,
  fetchAssignedPurchaseRequests,
  fetchMyPurchaseRequests,
  markPurchaseRequestItemBought,
  markPurchaseRequestItemNotAvailable,
  markPurchaseRequestItemPartial,
  type KdsPurchaseRequest,
} from "../api";

type Props = {
  token: string;
  mode: "request" | "my" | "buying";
  onClose: () => void;
};

const CATEGORIES = ["ingredients", "gas", "tools", "cleaning", "other"];

export function KdsPurchaseRequestOverlay({ token, mode, onClose }: Props) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("pcs");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [category, setCategory] = useState("ingredients");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<KdsPurchaseRequest[]>([]);

  useEffect(() => {
    if (mode === "my") {
      void fetchMyPurchaseRequests(token).then((r) => setRows(r.data ?? [])).catch((e) => setErr((e as Error).message));
    } else if (mode === "buying") {
      void fetchAssignedPurchaseRequests(token).then((r) => setRows(r.data ?? [])).catch((e) => setErr((e as Error).message));
    }
  }, [mode, token]);

  const submitRequest = async () => {
    const parsedQty = parseFloat(qty);
    if (!name.trim()) { setErr("Enter item name."); return; }
    if (isNaN(parsedQty) || parsedQty <= 0) { setErr("Invalid quantity."); return; }
    setBusy(true);
    setErr("");
    try {
      await createPurchaseRequest(token, {
        source: "kds",
        priority,
        items: [{
          free_text_name: name.trim(),
          category,
          requested_qty: parsedQty,
          requested_unit: unit,
          reason: category === "cleaning" ? "cleaning" : category === "gas" ? "gas" : "low_stock",
          notes: note.trim() || undefined,
        }],
      });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "request" ? "Request item" : mode === "my" ? "My requests" : "Buying list";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "min(480px, 100%)", maxHeight: "90vh", overflow: "auto", padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        {err && <p style={{ color: "#ef4444", fontSize: 13 }}>{err}</p>}

        {mode === "request" && (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {CATEGORIES.map((c) => (
                <button key={c} type="button" onClick={() => setCategory(c)} style={{ padding: "6px 10px", borderRadius: 999, border: "none", background: category === c ? "#1C1408" : "#EDE4D4", color: category === c ? "#fff" : "#2A1E0C", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  {c}
                </button>
              ))}
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" style={{ width: "100%", padding: 10, marginBottom: 8, borderRadius: 8, border: "1px solid #EDE4D4", boxSizing: "border-box" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" type="number" style={{ padding: 10, borderRadius: 8, border: "1px solid #EDE4D4" }} />
              <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit" style={{ padding: 10, borderRadius: 8, border: "1px solid #EDE4D4" }} />
            </div>
            <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} style={{ width: "100%", padding: 10, marginBottom: 8, borderRadius: 8, border: "1px solid #EDE4D4" }}>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" rows={2} style={{ width: "100%", padding: 10, marginBottom: 12, borderRadius: 8, border: "1px solid #EDE4D4", boxSizing: "border-box" }} />
            <button type="button" disabled={busy} onClick={() => void submitRequest()} style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: "#D4813A", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
              {busy ? "Submitting…" : "Submit"}
            </button>
          </>
        )}

        {(mode === "my" || mode === "buying") && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.length === 0 ? <p style={{ color: "#8B7355" }}>Nothing here.</p> : rows.map((r) => (
              <div key={r.id} style={{ border: "1px solid #EDE4D4", borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 700 }}>{r.request_no}</div>
                <div style={{ fontSize: 12, color: "#8B7355" }}>{r.status} · {r.priority}</div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 16, fontSize: 13 }}>
                  {r.items.map((item) => (
                    <li key={item.id} style={{ marginBottom: 6 }}>
                      {item.name} — {item.approved_qty ?? item.requested_qty} {item.requested_unit}
                      {mode === "buying" && !["received", "not_available", "bought"].includes(item.status) && (
                        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                          <button type="button" onClick={() => void markPurchaseRequestItemBought(token, r.id, item.id, { actual_qty: item.approved_qty ?? item.requested_qty })} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "none", background: "#047857", color: "#fff", cursor: "pointer" }}>Bought</button>
                          <button type="button" onClick={() => void markPurchaseRequestItemPartial(token, r.id, item.id, { actual_qty: (item.approved_qty ?? item.requested_qty) / 2 })} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #EDE4D4", cursor: "pointer" }}>Partial</button>
                          <button type="button" onClick={() => void markPurchaseRequestItemNotAvailable(token, r.id, item.id)} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #EDE4D4", cursor: "pointer" }}>N/A</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
